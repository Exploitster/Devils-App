'use client';
import { useEffect, type RefObject } from 'react';
import { Icon } from './app';
import { MESSAGE_LIMIT } from '@/lib/limits';

const COUNTER_FROM = 10000;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  disabled?: boolean;
  busy?: boolean;
  onCancel?: () => void;
  tag?: string;
  onClearTag?: () => void;
  status?: string;
  sticky?: boolean;
}

export function Composer({ value, onChange, onSubmit, inputRef, placeholder, disabled, busy, onCancel, tag, onClearTag, status, sticky }: ComposerProps) {
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  }, [value, inputRef]);
  const canSend = !disabled && !busy && value.trim().length > 0;
  return <form className={`chat-composer ${sticky ? 'composer-sticky' : ''}`} onSubmit={event => { event.preventDefault(); if (canSend) onSubmit(); }}>
    <div className="composer-box">
      {tag && <span className="composer-tag">{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={onClearTag}>×</button></span>}
      <label htmlFor="message" className="sr-only">Your message</label>
      <textarea ref={inputRef} id="message" rows={1} maxLength={MESSAGE_LIMIT} value={value} placeholder={placeholder} disabled={disabled}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            if (canSend) event.currentTarget.form?.requestSubmit();
          }
        }}/>
      {busy && onCancel
        ? <button type="button" className="composer-cancel" onClick={onCancel}>Cancel generation</button>
        : <button type="submit" className="send-button" aria-label="Send" disabled={!canSend}><Icon name="arrow" size={18}/></button>}
    </div>
    <p className="composer-meta" role="status">
      <span>{status ?? 'AI can make mistakes. Check the sources and keep your own judgment.'}</span>
      {value.length >= COUNTER_FROM && <span className="composer-count">{value.length.toLocaleString()} / {MESSAGE_LIMIT.toLocaleString()}</span>}
    </p>
  </form>;
}
