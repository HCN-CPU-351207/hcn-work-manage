// Ô tìm kiếm real-time + Command Palette "/" (mục 8.2)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COMMANDS, matchCommands, searchAll } from '../../core/search.ts';
import type { CommandDef, Hit } from '../../core/search.ts';
import { useApp } from '../../store/app.ts';
import { runCommand } from '../../lib/flows.ts';
import { cx } from '../../lib/labels.ts';
import { useIsMobile } from '../../lib/hooks.ts';
import { ISearch, IX } from '../Common/Icons.tsx';

type Entry = { kind: 'cmd'; cmd: CommandDef } | { kind: 'hit'; hit: Hit };

export function SearchPill() {
  const { t, i18n } = useTranslation();
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const data = useApp((s) => s.data);
  const nonce = useApp((s) => s.searchFocusNonce);
  const navigateTo = useApp((s) => s.navigateTo);
  const mobile = useIsMobile();
  const [text, setText] = useState(query);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // đồng bộ khi bộ lọc bị đổi từ nơi khác (Saved View, điều hướng)
  useEffect(() => {
    if (!text.startsWith('/') && text !== query) setText(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!nonce) return;
    setExpanded(true);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [nonce]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!text) setExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [text]);

  const isCmd = text.startsWith('/');
  const entries: Entry[] = useMemo(() => {
    if (isCmd) return matchCommands(text).map((cmd) => ({ kind: 'cmd' as const, cmd }));
    return searchAll(data, text, 18).map((hit) => ({ kind: 'hit' as const, hit }));
  }, [isCmd, text, data]);

  useEffect(() => setActive(0), [text]);

  const slash = (c: CommandDef) => `/${i18n.language === 'vi' ? c.keys[0] : c.keys[1] ?? c.keys[0]}`;

  const choose = (e: Entry) => {
    if (e.kind === 'cmd') {
      setText('');
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      runCommand(e.cmd.id);
    } else {
      setText('');
      setOpen(false);
      inputRef.current?.blur();
      navigateTo(e.hit.level, e.hit.id);
    }
    setExpanded(false);
  };

  const onChange = (v: string) => {
    setText(v);
    setOpen(true);
    setQuery(v.startsWith('/') ? '' : v);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(entries.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = entries[active];
      if (pick && (isCmd || open)) choose(pick);
      else setOpen(false);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (open) setOpen(false);
      else {
        onChange('');
        setOpen(false);
        inputRef.current?.blur();
        setExpanded(false);
      }
    }
  };

  const groups: { level: Hit['level']; items: { e: Entry; i: number }[] }[] = [];
  if (!isCmd) {
    entries.forEach((e, i) => {
      if (e.kind !== 'hit') return;
      let g = groups.find((x) => x.level === e.hit.level);
      if (!g) groups.push((g = { level: e.hit.level, items: [] }));
      g.items.push({ e, i });
    });
  }

  const showDrop = open && text.length > 0;
  return (
    <div ref={boxRef} className={cx('search', mobile && 'search-mobile', mobile && expanded && 'search-expanded')}>
      {mobile && !expanded ? (
        <button className="icon-btn" aria-label={t('toolbar.search')} onClick={() => { setExpanded(true); window.setTimeout(() => inputRef.current?.focus(), 0); }}>
          <ISearch size={18} />
        </button>
      ) : (
        <label className="search-pill">
          <ISearch size={16} className="search-icon" />
          <input
            ref={inputRef}
            value={text}
            placeholder={t('toolbar.searchPlaceholder')}
            aria-label={t('toolbar.search')}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
          />
          {text ? (
            <button className="search-clear" aria-label={t('common.clear')} onClick={() => { onChange(''); inputRef.current?.focus(); }}>
              <IX size={14} />
            </button>
          ) : (
            <kbd className="search-kbd">Ctrl K</kbd>
          )}
        </label>
      )}
      {showDrop && (
        <div className="search-drop" role="listbox">
          {isCmd ? (
            <>
              <div className="drop-head">{t('search.commands')}</div>
              {entries.length === 0 && <div className="drop-empty">{t('search.noCommand')}</div>}
              {entries.map((e, i) =>
                e.kind === 'cmd' ? (
                  <button key={e.cmd.id} role="option" aria-selected={i === active} className={cx('drop-item', i === active && 'active')} onMouseEnter={() => setActive(i)} onMouseDown={(ev) => ev.preventDefault()} onClick={() => choose(e)}>
                    <span className="cmd-slash">{slash(e.cmd)}</span>
                    <span className="drop-sub">{t(`cmd.${e.cmd.id}`)}</span>
                  </button>
                ) : null
              )}
            </>
          ) : entries.length === 0 ? (
            <div className="drop-empty">{t('search.noResults')}</div>
          ) : (
            <>
              <div className="drop-hint">{t('search.filtering')}</div>
              {groups.map((g) => (
                <div key={g.level}>
                  <div className="drop-head">{t(`level.${g.level}`)}</div>
                  {g.items.map(({ e, i }) =>
                    e.kind === 'hit' ? (
                      <button key={e.hit.id} role="option" aria-selected={i === active} className={cx('drop-item', i === active && 'active')} onMouseEnter={() => setActive(i)} onMouseDown={(ev) => ev.preventDefault()} onClick={() => choose(e)}>
                        <span className="code-tag">{e.hit.ma}</span>
                        <span className="drop-main">{e.hit.ten || t('common.untitled')}</span>
                        {e.hit.person && <span className="drop-sub">{e.hit.person}</span>}
                      </button>
                    ) : null
                  )}
                </div>
              ))}
            </>
          )}
          {!isCmd && <div className="drop-foot">{t('search.slashTip', { n: COMMANDS.length })}</div>}
        </div>
      )}
    </div>
  );
}
