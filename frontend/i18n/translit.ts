/**
 * Oʻzbek lotin → kirill transliteratsiyasi (1995-yilgi alifbo qoidalari, interfeys matnlari uchun).
 * uz-Cyrl lugʻati uz-Latn dan shu funksiya bilan avtomatik yasaladi (`scripts/i18n-cyrl.ts`).
 * ICU tuzilmasi (`{count}`, `{n, plural, one {…} other {…}}`) saqlanadi — faqat matn qismi oʻgiriladi.
 */

const LETTERS: Record<string, string> = {
  a: "а",
  b: "б",
  c: "ц",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "ҳ",
  i: "и",
  j: "ж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "қ",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "х",
  y: "й",
  z: "з",
};

const DIGRAPHS: Record<string, string> = { sh: "ш", ch: "ч", yo: "ё", yu: "ю", ya: "я", ye: "е" };
/** Rus tilidan kirgan soʻzlar: -tsiya → -ция (inventarizatsiya → инвентаризация). */
const LOAN: [RegExp, string][] = [[/^tsi(?=[ayo])/i, "ци"]];
const TURNED = /^[ʻ‘'`]/; // oʻ, gʻ belgisi
const VOWELS = new Set("aeiouAEIOU");
/** Qisqartmalar: harfma-harf emas, soʻzning kirill yozuvidagi bosh harflari. */
const ABBR: Record<string, string> = { YB: "ЕБ" };
/** Oʻgirilmaydigan soʻzlar (brend, qisqartma, klavish). */
const KEEP = new Set(["MEDIX", "PDF", "PIN", "Ctrl", "K", "Enter", "Esc", "Excel", "xlsx", "SMS", "QR", "ID", "API", "URL", "SKU"]);

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z]/.test(ch);
}

function cased(cyr: string, upper: boolean): string {
  return upper ? cyr.toUpperCase() : cyr;
}

/** Oddiy matn boʻlagini (ICU belgilarisiz) oʻgiradi. */
function plain(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (isLetter(ch) && !isLetter(text[i - 1])) {
      // Butun soʻzni oʻqiymiz — KEEP roʻyxati va raqamli kodlar (GS1, A4) oʻgirilmaydi.
      let j = i;
      while (j < text.length && (isLetter(text[j]) || /[0-9]/.test(text[j]!))) j++;
      const word = text.slice(i, j);
      if (ABBR[word]) {
        out += ABBR[word];
        i = j;
        continue;
      }
      if (KEEP.has(word) || /[0-9]/.test(word)) {
        out += word;
        i = j;
        continue;
      }
    }
    if (!isLetter(ch)) {
      // Tutuq belgisi (ʼ) → ъ; oʻ/gʻ belgisi harf bilan birga qayta ishlanadi.
      out += ch === "ʼ" || ch === "’" ? "ъ" : ch;
      i++;
      continue;
    }
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    const prev = text[i - 1];
    const wordStart = !isLetter(prev) && prev !== "ʼ" && prev !== "ʻ";
    const rest = text.slice(i);
    const loan = LOAN.find(([re]) => re.test(rest));
    if (loan && !wordStart) {
      const len = rest.match(loan[0])![0].length;
      out += cased(loan[1].slice(0, 1), upper) + loan[1].slice(1);
      i += len;
      continue;
    }
    if ((lower === "o" || lower === "g") && TURNED.test(text.slice(i + 1))) {
      out += cased(lower === "o" ? "ў" : "ғ", upper);
      i += 2;
      continue;
    }
    const pair = text.slice(i, i + 2).toLowerCase();
    // "s" + "h" faqat ikkalasi ham harf boʻlsa (ishonch → ишонч); "ye" — "yangi" emas, "yetkazish".
    // "yoʻq" → йўқ: oʻ birikmasi "yo" dan ustun.
    if (DIGRAPHS[pair] && isLetter(text[i + 1]) && !(pair === "yo" && TURNED.test(text.slice(i + 2)))) {
      out += cased(DIGRAPHS[pair], upper);
      i += 2;
      continue;
    }
    if (lower === "e" && (wordStart || (prev !== undefined && VOWELS.has(prev)))) {
      out += cased("э", upper);
      i++;
      continue;
    }
    out += cased(LETTERS[lower] ?? ch, upper);
    i++;
  }
  return out;
}

/** ICU xabarini oʻgiradi: argument nomlari, tur va tanlov kalitlari oʻzgarmaydi. */
export function toCyrillic(message: string): string {
  let pos = 0;

  function readMessage(stopAtBrace: boolean): string {
    let out = "";
    let buf = "";
    while (pos < message.length) {
      const ch = message[pos]!;
      if (ch === "{") {
        out += plain(buf);
        buf = "";
        out += readArgument();
        continue;
      }
      if (ch === "}" && stopAtBrace) break;
      buf += ch;
      pos++;
    }
    return out + plain(buf);
  }

  function readArgument(): string {
    // { nom [, tur [, kalit {xabar} ...]] }
    let out = "{";
    pos++;
    const head = message.slice(pos).match(/^\s*[\w]+\s*/);
    if (head) {
      out += head[0];
      pos += head[0].length;
    }
    if (message[pos] === ",") {
      const type = message.slice(pos).match(/^,\s*\w+\s*/)!;
      out += type[0];
      pos += type[0].length;
      if (message[pos] === ",") {
        out += ",";
        pos++;
        while (pos < message.length && message[pos] !== "}") {
          const key = message.slice(pos).match(/^\s*[^\s{}]+\s*/);
          if (!key) break;
          out += key[0];
          pos += key[0].length;
          if (message[pos] === "{") {
            pos++;
            out += "{" + readMessage(true) + "}";
            pos++;
          }
        }
      } else {
        // {d, date, short} kabi uslub — oʻzgarishsiz.
        const style = message.slice(pos).match(/^[^}]*/)!;
        out += style[0];
        pos += style[0].length;
      }
    }
    out += "}";
    pos++;
    return out;
  }

  return readMessage(false);
}

export type Messages = { [key: string]: string | Messages };

/** Lugʻatni chuqur oʻgiradi (kalitlar oʻzgarmaydi). */
export function messagesToCyrillic(messages: Messages): Messages {
  return Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, typeof v === "string" ? toCyrillic(v) : messagesToCyrillic(v)]));
}
