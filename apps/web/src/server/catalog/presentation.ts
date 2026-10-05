import 'server-only';
import { readFile } from 'node:fs/promises';
import { z } from '@shop/contracts';
import type { Product } from './contracts';

const exchangeSchema = z.object({
  result: z.literal('success'), base_code: z.literal('USD'),
  time_last_update_unix: z.number().int().positive(),
  time_next_update_unix: z.number().int().positive().optional(),
  rates: z.object({ VND: z.number().finite().positive().max(1000000) }),
});
export type Exchange = { rate: number; updated_at: string };
export function createExchangeReader(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: Exchange | null = null;
  let expires = 0;
  let pending: Promise<Exchange | null> | null = null;
  return async (): Promise<Exchange | null> => {
    if (now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetcher('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
        if (!response.ok) throw new Error('Exchange unavailable');
        const data = exchangeSchema.parse(await response.json());
        const updated = data.time_last_update_unix * 1000;
        // Never silently label an old/future snapshot as the current rate.
        if (updated > now() + 300000 || now() - updated > 48 * 3600000) throw new Error('Exchange expired');
        cached = { rate: data.rates.VND, updated_at: new Date(updated).toISOString() };
        const next = data.time_next_update_unix === undefined ? now() + 24 * 3600000
          : data.time_next_update_unix * 1000 > now() ? data.time_next_update_unix * 1000 : now() + 3600000;
        expires = Math.min(now() + 24 * 3600000, next, updated + 48 * 3600000);
      } catch {
        cached = null;
        expires = now() + 60000;
      }
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
const readExchange = createExchangeReader();
const titlesSchema = z.array(z.object({ id: z.string().regex(/^[A-Z0-9]{10}$/), original: z.string().max(500), vi: z.string().trim().min(1).max(1500) })).max(20000);
let titles = new Map<string, { original: string; vi: string }>();
let titlesExpires = 0;
async function readTitles() {
  if (Date.now() < titlesExpires) return titles;
  const file = process.env.CATALOG_TRANSLATIONS_FILE;
  try {
    titles = file ? new Map(titlesSchema.parse(JSON.parse(await readFile(file, 'utf8'))).map(row => [row.id, row])) : new Map();
  } catch { titles = new Map(); }
  titlesExpires = Date.now() + 60000;
  return titles;
}
export async function catalogPresentation() {
  const [exchange, translations] = await Promise.all([readExchange(), readTitles()]);
  return { exchange, translation: translations.size ? 'ready' : 'unavailable' };
}
export function createProductPresenter(exchangeReader = readExchange, titleReader = readTitles) {
return async (items: Product[], language: 'vi' | 'en') => {
  if (language === 'en') return items.map(item => ({ ...item, display_title: item.title, display_price: item.price_usd, display_currency: 'USD' }));
  const [exchange, translations] = await Promise.all([exchangeReader(), titleReader()]);
  return items.map(item => {
    const translated = translations.get(item.id);
    const vnd = item.price_usd !== null && exchange !== null ? Math.round(item.price_usd * exchange.rate) : null;
    const converted = vnd !== null && Number.isSafeInteger(vnd) && vnd > 0;
    return { ...item, display_title: translated?.original === item.title ? translated.vi : item.title,
      title_translated: translated?.original === item.title && translated.vi !== item.title,
      display_price: converted ? vnd : item.price_usd,
      display_currency: converted ? 'VND' : 'USD', exchange: converted ? exchange : null };
  });
};
}
export const presentProducts = createProductPresenter();
