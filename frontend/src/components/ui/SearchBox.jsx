import { useState, useEffect } from 'react';
import { useLanguage, useText } from '../../locale/useLanguage';
import { catalogRequest } from '../../catalog/api';

export default function SearchBox({ category, onSearch, initialQuery = '' }) {
  const t = useText();
  const [language] = useLanguage();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    setSuggestions([]); setActiveIndex(-1);
    if (!query.trim()) return () => controller.abort();
    const timer = setTimeout(() => {
      catalogRequest('search/suggestions', {q: query, category, limit: 6}, controller.signal)
        .then(result => {setSuggestions(result.items); setActiveIndex(-1);})
        .catch(() => {if (!controller.signal.aborted) setSuggestions([]);});
    }, 250);
    return () => {clearTimeout(timer); controller.abort();};
  }, [query, category, language]);
  const expanded = open && suggestions.length > 0;
  const active = expanded ? suggestions[activeIndex] : null;

  const search = value => {
    setQuery(value);
    setOpen(false);
    setActiveIndex(-1);
    onSearch(value);
  };

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    } else if (suggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => event.key === 'ArrowDown'
        ? (index + 1) % suggestions.length
        : (index <= 0 ? suggestions.length : index) - 1);
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      search(active.query || active.label);
    }
  };

  return (
    <form className="search-bar" onSubmit={event => { event.preventDefault(); search(query); }}>
      <div className="search-input-wrapper" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <input
          type="search"
          role="combobox"
          aria-label={t("Tìm kiếm sản phẩm")}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="product-search-suggestions"
          aria-activedescendant={active ? `suggestion-${active.id}` : undefined}
          autoComplete="off"
          placeholder={t("Tìm kiếm sản phẩm...")}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1); }}
          onKeyDown={handleKeyDown}
        />
        {expanded && (
          <ul id="product-search-suggestions" className="search-suggestions" role="listbox" aria-label={t("Gợi ý tìm kiếm")}>
            {suggestions.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  id={`suggestion-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => search(item.query || item.label)}
                >
                  <span>{item.label}</span><small>{item.kind}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit">{t("Tìm kiếm")}</button>
    </form>
  );
}
