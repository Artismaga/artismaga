import { safeLink } from '../shared/writing.js';
/** Word/Docs paste is reduced to the same semantic vocabulary as stored chapters. */
export function cleanPaste(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  body
    .querySelectorAll(
      'script,style,iframe,object,embed,svg,math,img,video,audio,form,input,button,template',
    )
    .forEach((el) => el.remove());
  for (const el of [...body.querySelectorAll('*')]) {
    const tag = el.tagName;
    const href = el.getAttribute('href');
    const start = el.getAttribute('start');
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (tag === 'A' && href && safeLink(href)) el.setAttribute('href', href);
    else if (tag === 'A') {
      el.replaceWith(...el.childNodes);
      continue;
    }
    if (tag === 'OL' && start && /^[1-9][0-9]{0,3}$/.test(start)) el.setAttribute('start', start);
    if (tag === 'DIV' && el.querySelector('p,h1,h2,h3,h4,h5,h6,div,ul,ol,blockquote')) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    if (['H1', 'H5', 'H6', 'DIV', 'TD', 'TH'].includes(tag)) {
      const replacement = body.ownerDocument.createElement(tag.startsWith('H') ? 'h2' : 'p');
      replacement.append(...el.childNodes);
      el.replaceWith(replacement);
    } else if (
      ![
        'P',
        'H2',
        'H3',
        'H4',
        'UL',
        'OL',
        'LI',
        'BLOCKQUOTE',
        'STRONG',
        'EM',
        'B',
        'I',
        'A',
        'HR',
        'BR',
      ].includes(tag)
    )
      el.replaceWith(...el.childNodes);
  }
  return body.innerHTML;
}
