import { useEffect, useRef, useState } from 'react';
import './CatalogSelect.css';

export default function CatalogSelect({ id, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef(null);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const choose = index => {
    setOpen(false);
    onChange(options[index].value);
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return <div className="catalog-category-control" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id}>{label}</label>
    <div className="catalog-select">
      <button id={id} type="button" className="catalog-select-trigger" role="combobox"
        aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => {setActiveIndex(selectedIndex); setOpen(!open);}}
        onKeyDown={event => {
          if (event.key === 'Escape') {event.preventDefault(); setOpen(false);}
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
              : !open ? selectedIndex : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
          } else if (open && ['Enter', ' '].includes(event.key)) {event.preventDefault(); choose(activeIndex);}
        }}>
        <span>{options[selectedIndex].label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <ul id={`${id}-options`} className="catalog-select-options" role="listbox" aria-label={label}>
        {options.map((option, index) => <li key={option.value} role="presentation">
          <button id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1}
            aria-selected={option.value === value} data-active={index === activeIndex}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
            <span>{option.label}</span><span className="catalog-select-check" aria-hidden="true">{option.value === value ? '✓' : ''}</span>
          </button>
        </li>)}
      </ul>}
    </div>
  </div>;
}
