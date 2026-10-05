import { useLanguage } from './useLanguage';

export default function CatalogPresentation() {
  const [language] = useLanguage();
  if (language !== 'vi') return null;
  return <a className="exchange-rate-source" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a>;
}
