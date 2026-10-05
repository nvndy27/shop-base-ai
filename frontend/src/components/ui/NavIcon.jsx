import React from 'react';

const paths = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-8h6v8" /></>,
  shop: <><path d="M3 10 5 4h14l2 6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 13v8h14v-8M9 21v-6h6v6" /></>,
  cart: <><path d="M2 3h3l3 13h11l3-9H6" /><circle cx="9" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></>,
  orders: <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" /></>,
  user: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  settings: <><path d="m10 2-.5 3-2 1.2L5 5 2.5 9l2.5 2v2l-2.5 2L5 19l2.5-1.2 2 1.2.5 3h4l.5-3 2-1.2L19 19l2.5-4-2.5-2v-2l2.5-2L19 5l-2.5 1.2-2-1.2L14 2Z" /><circle cx="12" cy="12" r="3" /></>,
};

export default function NavIcon({ name }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
