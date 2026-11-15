/**
 * Pure, deterministic mathematical, financial, unit-conversion, chronological,
 * and anthropometric calculation engine for Forma Studio's 32 Extra Tools.
 */

export type AngleMode = 'DEG' | 'RAD';

/**
 * Formats numbers cleanly without IEEE-754 floating-point artifacts
 * (e.g., 0.1 + 0.2 -> "0.3", never "0.30000000000000004").
 */
export function formatCleanNumber(value: number, maxDecimals = 8): string {
  if (!Number.isFinite(value)) return 'Undefined';
  if (Math.abs(value) < 1e-12) return '0';

  const absVal = Math.abs(value);
  if ((absVal >= 1e12 || (absVal > 0 && absVal < 1e-6)) && maxDecimals >= 6) {
    return value.toExponential(6).replace(/\.?0+e/, 'e');
  }

  // Eliminate binary float tail noise via 10-significant-digit rounding first
  const sanitized = Number(value.toPrecision(10));
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round(sanitized * factor) / factor;

  const parts = String(rounded).split('.');
  parts[0] = Number(parts[0]).toLocaleString('en-US');
  return parts.join('.');
}

export function roundClean(value: number, decimals = 8): number {
  if (!Number.isFinite(value)) return NaN;
  if (Math.abs(value) < 1e-13) return 0;
  const sanitized = Number(value.toPrecision(10));
  const factor = Math.pow(10, decimals);
  return Math.round(sanitized * factor) / factor;
}

/**
 * Safely parses a state value into a number, returning `fallback` ONLY when
 * the value is empty (''), undefined, null, or NaN — preserving explicit `0`.
 */
export function numVal(v: any, fallback: number): number {
  if (v === '' || v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Preserves empty string '' while typing in controlled numeric inputs so users
 * can backspace/clear any input field cleanly without snapping to 0.
 */
export function parseNumInput(raw: string): number | '' {
  return raw === '' ? '' : Number(raw);
}

function getZoneCalendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = parseInt(p.value, 10) || 0;
    }
  }
  return {
    year: map.year || 1970,
    month: map.month || 1,
    day: map.day || 1,
    hour: map.hour === 24 ? 0 : map.hour || 0,
    minute: map.minute || 0,
    second: map.second || 0,
  };
}

/**
 * Returns the exact offset in minutes (e.g. +330 for Asia/Kolkata, +345 for Asia/Kathmandu)
 * between the specified IANA `timeZone` and UTC at `date`.
 */
export function getZoneOffsetMinutesAt(date: Date, timeZone: string): number {
  try {
    const z = getZoneCalendarParts(date, timeZone);
    const u = getZoneCalendarParts(date, 'UTC');
    const zMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
    const uMs = Date.UTC(u.year, u.month - 1, u.day, u.hour, u.minute, u.second);
    return Math.round((zMs - uMs) / 60000);
  } catch {
    return 0;
  }
}

/**
 * Converts `sliderMinutes` (0..1439 local time of day in `baseZone` on `nowDate`)
 * into the exact corresponding UTC `Date`, preserving 30-min and 45-min IANA offsets.
 */
export function computeZoneUtcDateFromLocalMinutes(
  baseZone: string,
  sliderMinutes: number,
  nowDate: Date = new Date()
): Date {
  const safeZone = baseZone || 'UTC';
  const clampedMins = Math.max(0, Math.min(1439, Math.round(sliderMinutes)));
  const bzToday = getZoneCalendarParts(nowDate, safeZone);
  const wallMs = Date.UTC(
    bzToday.year,
    bzToday.month - 1,
    bzToday.day,
    Math.floor(clampedMins / 60),
    clampedMins % 60,
    0
  );
  const offset1 = getZoneOffsetMinutesAt(new Date(wallMs), safeZone);
  const candMs = wallMs - offset1 * 60000;
  const offset2 = getZoneOffsetMinutesAt(new Date(candMs), safeZone);
  return new Date(wallMs - offset2 * 60000);
}

/**
 * #4 Compound Interest Calculator with exact periodic rate conversion
 * r_m = (1 + r/k)^(k/m) - 1 when compounding frequency k differs from deposit frequency m.
 */
export function calculateCompoundInterestExact(params: {
  principal: number;
  annualRatePct: number;
  compoundingPerYear: number;
  years: number;
  contribution: number;
  contributionCadence: 'monthly' | 'annual';
}) {
  const P = Math.max(0, Number(params.principal) || 0);
  const rPct = Number(params.annualRatePct) || 0;
  const k = Math.max(1, Number(params.compoundingPerYear) || 12);
  const t = Math.max(0, Number(params.years) || 0);
  const PMT = Math.max(0, Number(params.contribution) || 0);
  const m = params.contributionCadence === 'annual' ? 1 : 12;

  const r = rPct / 100;
  const fvPrincipal = P * Math.pow(1 + r / k, k * t);

  // Exact equivalent periodic rate per contribution interval m:
  // r_m = (1 + r/k)^(k/m) - 1
  const totalDepositPeriods = m * t;
  const rm = r === 0 ? 0 : Math.pow(1 + r / k, k / m) - 1;
  const fvContributions =
    rm === 0
      ? PMT * totalDepositPeriods
      : PMT * ((Math.pow(1 + rm, totalDepositPeriods) - 1) / rm);

  const finalBalance = fvPrincipal + fvContributions;
  const totalPrincipalContributed = P + PMT * totalDepositPeriods;
  const totalInterestEarned = Math.max(0, finalBalance - totalPrincipalContributed);
  const principalSharePct =
    finalBalance > 0 ? (totalPrincipalContributed / finalBalance) * 100 : 100;

  return {
    finalBalance: roundClean(finalBalance, 2),
    totalPrincipalContributed: roundClean(totalPrincipalContributed, 2),
    totalInterestEarned: roundClean(totalInterestEarned, 2),
    principalSharePct: roundClean(principalSharePct, 2),
    effectivePeriodicRatePct: roundClean(rm * 100, 6),
  };
}

/**
 * #27 Leap-Year-Aware Exact Age & Next Birthday Countdown Calculator
 */
export function calculateExactAgeChronological(birthStr: string, targetStr: string) {
  const bDate = new Date(`${birthStr}T00:00:00`);
  const tDate = new Date(`${targetStr}T00:00:00`);
  const valid =
    !Number.isNaN(bDate.getTime()) && !Number.isNaN(tDate.getTime()) && tDate >= bDate;

  if (!valid) {
    return {
      valid: false,
      error:
        tDate < bDate
          ? 'Validation Guard: Birth date cannot be in the future relative to the target date.'
          : 'Please enter valid calendar dates.',
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      totalWeeks: 0,
      remDays: 0,
      totalHours: 0,
      daysUntilNextBirthday: 0,
      bornWeekday: '—',
    };
  }

  let years = tDate.getFullYear() - bDate.getFullYear();
  let months = tDate.getMonth() - bDate.getMonth();
  let days = tDate.getDate() - bDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(tDate.getFullYear(), tDate.getMonth(), 0);
    const prevMonthDays = prevMonth.getDate();
    const effectiveBirthDay = Math.min(bDate.getDate(), prevMonthDays);
    days = tDate.getDate() + (prevMonthDays - effectiveBirthDay);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.round((tDate.getTime() - bDate.getTime()) / 86400000);
  const isLeapYear = (yr: number) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;

  const buildBirthdayForYear = (yr: number) => {
    const bm = bDate.getMonth();
    const bd = bDate.getDate();
    // Handle Feb 29 leap-day birthday in non-leap years (celebrated Feb 28)
    if (bm === 1 && bd === 29 && !isLeapYear(yr)) {
      return new Date(yr, 1, 28);
    }
    return new Date(yr, bm, bd);
  };

  let nextBday = buildBirthdayForYear(tDate.getFullYear());
  if (nextBday < tDate) {
    nextBday = buildBirthdayForYear(tDate.getFullYear() + 1);
  }
  const daysUntilNextBirthday = Math.round((nextBday.getTime() - tDate.getTime()) / 86400000);
  const bornWeekday = bDate.toLocaleDateString('en-US', { weekday: 'long' });

  return {
    valid: true,
    years,
    months,
    days,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    remDays: totalDays % 7,
    totalHours: totalDays * 24,
    daysUntilNextBirthday,
    bornWeekday,
  };
}

// ============================================================================
// SAFE DETERMINISTIC MATH PARSER & SHUNTING-YARD EVALUATOR (#9 & #11)
// Supports:
// - Implicit multiplication: 2(3+4), (2+1)(3+1), 2pi, 3sqrt(16), 2x
// - DEG / RAD mode toggle for sin, cos, tan, asin, acos, atan
// - Constants: pi, e
// - Operators: +, -, *, /, ^, unary +/-
// ============================================================================

type TokenType = 'NUMBER' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN';

interface MathToken {
  type: TokenType;
  value: string;
}

const MATH_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sqrt',
  'cbrt',
  'abs',
  'ln',
  'log',
  'exp',
  'floor',
  'ceil',
  'round',
]);

export function tokenizeMathExpression(rawExpr: string): MathToken[] {
  const expr = String(rawExpr || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .trim();

  const rawTokens: MathToken[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      if (i < expr.length && (expr[i] === 'e' || expr[i] === 'E')) {
        const next = expr[i + 1] || '';
        const next2 = expr[i + 2] || '';
        if (/[0-9]/.test(next) || ((next === '+' || next === '-') && /[0-9]/.test(next2))) {
          numStr += expr[i++];
          if (expr[i] === '+' || expr[i] === '-') numStr += expr[i++];
          while (i < expr.length && /[0-9]/.test(expr[i])) {
            numStr += expr[i++];
          }
        }
      }
      rawTokens.push({ type: 'NUMBER', value: numStr });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let idStr = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        idStr += expr[i++];
      }
      rawTokens.push({ type: 'IDENT', value: idStr.toLowerCase() });
      continue;
    }

    if (ch === '(') {
      rawTokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }

    if (ch === ')') {
      rawTokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    if (['+', '-', '*', '/', '^'].includes(ch)) {
      rawTokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }

    throw new Error(`Unrecognized symbol "${ch}"`);
  }

  // Insert implicit multiplication '*' where mathematically standard:
  // e.g. 2(3+4), (2+1)(3+1), 2pi, 2x, 3sqrt(16), )x, )2, x(2)
  const outTokens: MathToken[] = [];
  for (let idx = 0; idx < rawTokens.length; idx++) {
    const cur = rawTokens[idx];
    outTokens.push(cur);

    const next = rawTokens[idx + 1];
    if (!next) continue;

    const curIsValue =
      cur.type === 'NUMBER' ||
      cur.type === 'RPAREN' ||
      (cur.type === 'IDENT' && !MATH_FUNCTIONS.has(cur.value));

    const nextStartsFactor =
      next.type === 'LPAREN' || next.type === 'IDENT' || next.type === 'NUMBER';

    if (curIsValue && nextStartsFactor) {
      outTokens.push({ type: 'OP', value: '*' });
    }
  }

  return outTokens;
}

export function evaluateMathExpression(
  rawExpr: string,
  variables: Record<string, number> = {},
  angleMode: AngleMode = 'DEG'
): number {
  const tokens = tokenizeMathExpression(rawExpr);
  if (tokens.length === 0) return NaN;

  const outputQueue: MathToken[] = [];
  const opStack: MathToken[] = [];

  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    'u-': 3,
    'u+': 3,
    '^': 4,
  };
  const rightAssociative = new Set(['^', 'u-', 'u+']);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'NUMBER') {
      outputQueue.push(t);
    } else if (t.type === 'IDENT') {
      if (MATH_FUNCTIONS.has(t.value)) {
        opStack.push(t);
      } else {
        outputQueue.push(t);
      }
    } else if (t.type === 'OP') {
      const prev = tokens[i - 1];
      const isUnary = !prev || prev.type === 'OP' || prev.type === 'LPAREN';
      const opVal = isUnary && (t.value === '-' || t.value === '+') ? `u${t.value}` : t.value;
      const currentOp: MathToken = { type: 'OP', value: opVal };

      while (opStack.length > 0) {
        const top = opStack[opStack.length - 1];
        if (top.type === 'IDENT' && MATH_FUNCTIONS.has(top.value)) {
          outputQueue.push(opStack.pop()!);
          continue;
        }
        if (top.type === 'OP') {
          const pTop = precedence[top.value] || 0;
          const pCur = precedence[currentOp.value] || 0;
          if (pTop > pCur || (pTop === pCur && !rightAssociative.has(currentOp.value))) {
            outputQueue.push(opStack.pop()!);
            continue;
          }
        }
        break;
      }
      opStack.push(currentOp);
    } else if (t.type === 'LPAREN') {
      opStack.push(t);
    } else if (t.type === 'RPAREN') {
      let foundLeft = false;
      while (opStack.length > 0) {
        const top = opStack.pop()!;
        if (top.type === 'LPAREN') {
          foundLeft = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!foundLeft) {
        throw new Error('Mismatched parentheses');
      }
      if (
        opStack.length > 0 &&
        opStack[opStack.length - 1].type === 'IDENT' &&
        MATH_FUNCTIONS.has(opStack[opStack.length - 1].value)
      ) {
        outputQueue.push(opStack.pop()!);
      }
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop()!;
    if (top.type === 'LPAREN' || top.type === 'RPAREN') {
      throw new Error('Mismatched parentheses');
    }
    outputQueue.push(top);
  }

  const evalStack: number[] = [];
  const toRad = (v: number) => (angleMode === 'DEG' ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (angleMode === 'DEG' ? (v * 180) / Math.PI : v);

  for (const tok of outputQueue) {
    if (tok.type === 'NUMBER') {
      const n = Number(tok.value);
      if (Number.isNaN(n)) throw new Error(`Invalid number "${tok.value}"`);
      evalStack.push(n);
    } else if (tok.type === 'IDENT' && !MATH_FUNCTIONS.has(tok.value)) {
      if (tok.value === 'pi') {
        evalStack.push(Math.PI);
      } else if (tok.value === 'e') {
        evalStack.push(Math.E);
      } else if (tok.value in variables) {
        evalStack.push(variables[tok.value]);
      } else {
        throw new Error(`Unknown variable "${tok.value}"`);
      }
    } else if (tok.type === 'IDENT' && MATH_FUNCTIONS.has(tok.value)) {
      if (evalStack.length < 1) throw new Error(`Missing argument for ${tok.value}()`);
      const arg = evalStack.pop()!;
      switch (tok.value) {
        case 'sin': {
          const r = toRad(arg);
          const s = Math.sin(r);
          evalStack.push(Math.abs(s) < 1e-15 ? 0 : roundClean(s, 12));
          break;
        }
        case 'cos': {
          const r = toRad(arg);
          const c = Math.cos(r);
          evalStack.push(Math.abs(c) < 1e-15 ? 0 : roundClean(c, 12));
          break;
        }
        case 'tan': {
          if (angleMode === 'DEG' && Math.abs(((arg % 180) + 180) % 180 - 90) < 1e-9) {
            evalStack.push(NaN);
          } else {
            const r = toRad(arg);
            const tVal = Math.tan(r);
            evalStack.push(Math.abs(tVal) > 1e14 ? NaN : roundClean(tVal, 12));
          }
          break;
        }
        case 'asin':
          evalStack.push(arg < -1 || arg > 1 ? NaN : roundClean(fromRad(Math.asin(arg)), 10));
          break;
        case 'acos':
          evalStack.push(arg < -1 || arg > 1 ? NaN : roundClean(fromRad(Math.acos(arg)), 10));
          break;
        case 'atan':
          evalStack.push(roundClean(fromRad(Math.atan(arg)), 10));
          break;
        case 'sqrt':
          evalStack.push(arg < 0 ? NaN : Math.sqrt(arg));
          break;
        case 'cbrt':
          evalStack.push(Math.cbrt(arg));
          break;
        case 'abs':
          evalStack.push(Math.abs(arg));
          break;
        case 'ln':
          evalStack.push(arg <= 0 ? NaN : Math.log(arg));
          break;
        case 'log':
          evalStack.push(arg <= 0 ? NaN : Math.log10(arg));
          break;
        case 'exp':
          evalStack.push(Math.exp(arg));
          break;
        case 'floor':
          evalStack.push(Math.floor(arg));
          break;
        case 'ceil':
          evalStack.push(Math.ceil(arg));
          break;
        case 'round':
          evalStack.push(Math.round(arg));
          break;
        default:
          evalStack.push(NaN);
      }
    } else if (tok.type === 'OP') {
      if (tok.value === 'u-' || tok.value === 'u+') {
        if (evalStack.length < 1) throw new Error('Invalid unary operator');
        const v = evalStack.pop()!;
        evalStack.push(tok.value === 'u-' ? -v : v);
      } else {
        if (evalStack.length < 2) throw new Error('Incomplete arithmetic expression');
        const b = evalStack.pop()!;
        const a = evalStack.pop()!;
        switch (tok.value) {
          case '+':
            evalStack.push(a + b);
            break;
          case '-':
            evalStack.push(a - b);
            break;
          case '*':
            evalStack.push(a * b);
            break;
          case '/':
            evalStack.push(b === 0 ? NaN : a / b);
            break;
          case '^':
            evalStack.push(Math.pow(a, b));
            break;
          default:
            evalStack.push(NaN);
        }
      }
    }
  }

  if (evalStack.length !== 1) {
    throw new Error('Malformed mathematical expression');
  }
  return roundClean(evalStack[0], 10);
}

// ============================================================================
// #12 BIGINT BASE / NUMBER SYSTEM & RATIO CONVERTER
// ============================================================================

export interface BigIntBaseConversionResult {
  valid: boolean;
  error?: string;
  binary: string;
  octal: string;
  decimal: string;
  hexadecimal: string;
  bitLength: number;
}

export function parseBigIntInBase(raw: string, base: 2 | 8 | 10 | 16): bigint {
  const clean = String(raw || '').trim().replace(/[\s_]/g, '');
  if (!clean) throw new Error('Enter a value to convert.');

  const isNegative = clean.startsWith('-');
  const body = isNegative ? clean.slice(1) : clean.startsWith('+') ? clean.slice(1) : clean;
  if (!body) throw new Error('Invalid digits.');

  let val: bigint;
  if (base === 2) {
    if (!/^[01]+$/.test(body)) throw new Error('Binary (Base 2) only accepts digits 0 and 1.');
    val = BigInt(`0b${body}`);
  } else if (base === 8) {
    if (!/^[0-7]+$/.test(body)) throw new Error('Octal (Base 8) only accepts digits 0–7.');
    val = BigInt(`0o${body}`);
  } else if (base === 10) {
    if (!/^[0-9]+$/.test(body)) throw new Error('Decimal (Base 10) only accepts integer digits 0–9.');
    val = BigInt(body);
  } else {
    if (!/^[0-9a-fA-F]+$/.test(body)) {
      throw new Error('Hexadecimal (Base 16) only accepts 0–9 and A–F.');
    }
    val = BigInt(`0x${body}`);
  }

  return isNegative ? -val : val;
}

export function convertBaseBigInt(
  raw: string,
  fromBase: 2 | 8 | 10 | 16
): BigIntBaseConversionResult {
  try {
    const n = parseBigIntInBase(raw, fromBase);
    const absN = n < 0n ? -n : n;
    const sign = n < 0n ? '-' : '';
    const binStr = absN.toString(2);
    return {
      valid: true,
      binary: sign + binStr,
      octal: sign + absN.toString(8),
      decimal: sign + absN.toString(10),
      hexadecimal: sign + absN.toString(16).toUpperCase(),
      bitLength: n === 0n ? 1 : binStr.length,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err?.message || 'Invalid number for selected base.',
      binary: '—',
      octal: '—',
      decimal: '—',
      hexadecimal: '—',
      bitLength: 0,
    };
  }
}

export function computeBitwiseBigInt(
  aRaw: string,
  bRaw: string,
  base: 2 | 8 | 10 | 16
): { andDec: string; orDec: string; xorDec: string; andHex: string; orHex: string; xorHex: string } {
  try {
    const a = parseBigIntInBase(aRaw, base);
    const b = parseBigIntInBase(bRaw, base);
    const andVal = a & b;
    const orVal = a | b;
    const xorVal = a ^ b;
    const fmtHex = (v: bigint) => (v < 0n ? `-0x${(-v).toString(16).toUpperCase()}` : `0x${v.toString(16).toUpperCase()}`);
    return {
      andDec: andVal.toString(10),
      orDec: orVal.toString(10),
      xorDec: xorVal.toString(10),
      andHex: fmtHex(andVal),
      orHex: fmtHex(orVal),
      xorHex: fmtHex(xorVal),
    };
  } catch {
    return {
      andDec: '—',
      orDec: '—',
      xorDec: '—',
      andHex: '—',
      orHex: '—',
      xorHex: '—',
    };
  }
}

function gcdNumbers(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function simplifyRatioAndProportion(a: number, b: number, c: number) {
  const safeA = Number(a);
  const safeB = Number(b);
  const safeC = Number(c);
  if (!Number.isFinite(safeA) || !Number.isFinite(safeB) || safeA === 0 || safeB === 0) {
    return {
      simplified: 'Undefined (Non-zero required)',
      shareA: '0%',
      shareB: '0%',
      solvedX: 'Undefined',
    };
  }
  const scale = 10000;
  const intA = Math.round(safeA * scale);
  const intB = Math.round(safeB * scale);
  const div = gcdNumbers(intA, intB);
  const simpA = intA / div;
  const simpB = intB / div;
  const total = Math.abs(safeA) + Math.abs(safeB);
  const shareA = total > 0 ? `${formatCleanNumber((Math.abs(safeA) / total) * 100, 2)}%` : '0%';
  const shareB = total > 0 ? `${formatCleanNumber((Math.abs(safeB) / total) * 100, 2)}%` : '0%';
  const solvedX = safeA !== 0 ? formatCleanNumber((safeB * safeC) / safeA, 6) : 'Undefined';

  return {
    simplified: `${simpA} : ${simpB}`,
    shareA,
    shareB,
    solvedX,
  };
}

// ============================================================================
// #13 - #26 UNIT & ENGINEERING CONVERTERS (14 TOOLS)
// ============================================================================

export interface UnitDefinition {
  id: string;
  label: string;
  symbol: string;
  /** Factor relative to base SI unit (used for linear converters) */
  toBaseFactor?: number;
}

export interface UnitConverterConfig {
  toolId: string;
  defaultFrom: string;
  defaultTo: string;
  defaultValue: number;
  units: UnitDefinition[];
}

export const UNIT_CONVERTER_CONFIGS: Record<string, UnitConverterConfig> = {
  'extra-13-length': {
    toolId: 'extra-13-length',
    defaultFrom: 'm',
    defaultTo: 'ft',
    defaultValue: 10,
    units: [
      { id: 'mm', label: 'Millimeters (mm)', symbol: 'mm', toBaseFactor: 0.001 },
      { id: 'cm', label: 'Centimeters (cm)', symbol: 'cm', toBaseFactor: 0.01 },
      { id: 'm', label: 'Meters (m)', symbol: 'm', toBaseFactor: 1 },
      { id: 'km', label: 'Kilometers (km)', symbol: 'km', toBaseFactor: 1000 },
      { id: 'in', label: 'Inches (in)', symbol: 'in', toBaseFactor: 0.0254 },
      { id: 'ft', label: 'Feet (ft)', symbol: 'ft', toBaseFactor: 0.3048 },
      { id: 'yd', label: 'Yards (yd)', symbol: 'yd', toBaseFactor: 0.9144 },
      { id: 'mi', label: 'Miles (mi)', symbol: 'mi', toBaseFactor: 1609.344 },
    ],
  },
  'extra-14-storage': {
    toolId: 'extra-14-storage',
    defaultFrom: 'MB',
    defaultTo: 'MiB',
    defaultValue: 100,
    units: [
      { id: 'b', label: 'Bits (b)', symbol: 'b', toBaseFactor: 0.125 },
      { id: 'B', label: 'Bytes (B)', symbol: 'B', toBaseFactor: 1 },
      { id: 'KB', label: 'Kilobytes — Decimal (KB)', symbol: 'KB', toBaseFactor: 1e3 },
      { id: 'KiB', label: 'Kibibytes — Binary (KiB)', symbol: 'KiB', toBaseFactor: 1024 },
      { id: 'MB', label: 'Megabytes — Decimal (MB)', symbol: 'MB', toBaseFactor: 1e6 },
      { id: 'MiB', label: 'Mebibytes — Binary (MiB)', symbol: 'MiB', toBaseFactor: Math.pow(1024, 2) },
      { id: 'GB', label: 'Gigabytes — Decimal (GB)', symbol: 'GB', toBaseFactor: 1e9 },
      { id: 'GiB', label: 'Gibibytes — Binary (GiB)', symbol: 'GiB', toBaseFactor: Math.pow(1024, 3) },
      { id: 'TB', label: 'Terabytes — Decimal (TB)', symbol: 'TB', toBaseFactor: 1e12 },
      { id: 'TiB', label: 'Tebibytes — Binary (TiB)', symbol: 'TiB', toBaseFactor: Math.pow(1024, 4) },
    ],
  },
  'extra-15-pressure': {
    toolId: 'extra-15-pressure',
    defaultFrom: 'bar',
    defaultTo: 'psi',
    defaultValue: 2.5,
    units: [
      { id: 'Pa', label: 'Pascals (Pa)', symbol: 'Pa', toBaseFactor: 1 },
      { id: 'hPa', label: 'Hectopascals (hPa)', symbol: 'hPa', toBaseFactor: 100 },
      { id: 'kPa', label: 'Kilopascals (kPa)', symbol: 'kPa', toBaseFactor: 1000 },
      { id: 'bar', label: 'Bar (bar)', symbol: 'bar', toBaseFactor: 100000 },
      { id: 'psi', label: 'Pounds per sq. inch (psi)', symbol: 'psi', toBaseFactor: 6894.757293168 },
      { id: 'atm', label: 'Standard Atmospheres (atm)', symbol: 'atm', toBaseFactor: 101325 },
    ],
  },
  'extra-16-weight': {
    toolId: 'extra-16-weight',
    defaultFrom: 'kg',
    defaultTo: 'lb',
    defaultValue: 75,
    units: [
      { id: 'mg', label: 'Milligrams (mg)', symbol: 'mg', toBaseFactor: 1e-6 },
      { id: 'g', label: 'Grams (g)', symbol: 'g', toBaseFactor: 0.001 },
      { id: 'kg', label: 'Kilograms (kg)', symbol: 'kg', toBaseFactor: 1 },
      { id: 't', label: 'Metric Tonnes (t)', symbol: 't', toBaseFactor: 1000 },
      { id: 'oz', label: 'Ounces (oz)', symbol: 'oz', toBaseFactor: 0.028349523125 },
      { id: 'lb', label: 'Pounds (lb)', symbol: 'lb', toBaseFactor: 0.45359237 },
    ],
  },
  'extra-17-speed': {
    toolId: 'extra-17-speed',
    defaultFrom: 'km/h',
    defaultTo: 'mph',
    defaultValue: 100,
    units: [
      { id: 'm/s', label: 'Meters per second (m/s)', symbol: 'm/s', toBaseFactor: 1 },
      { id: 'km/h', label: 'Kilometers per hour (km/h)', symbol: 'km/h', toBaseFactor: 1 / 3.6 },
      { id: 'mph', label: 'Miles per hour (mph)', symbol: 'mph', toBaseFactor: 0.44704 },
      { id: 'kn', label: 'Knots (kn)', symbol: 'kn', toBaseFactor: 1852 / 3600 },
    ],
  },
  'extra-18-volume': {
    toolId: 'extra-18-volume',
    defaultFrom: 'L',
    defaultTo: 'gal_us',
    defaultValue: 5,
    units: [
      { id: 'mL', label: 'Milliliters (mL)', symbol: 'mL', toBaseFactor: 0.001 },
      { id: 'L', label: 'Liters (L)', symbol: 'L', toBaseFactor: 1 },
      { id: 'm3', label: 'Cubic Meters (m³)', symbol: 'm³', toBaseFactor: 1000 },
      { id: 'fl_oz_us', label: 'US Fluid Ounces (fl oz)', symbol: 'fl oz (US)', toBaseFactor: 0.0295735295625 },
      { id: 'cup_us', label: 'US Cups (cup)', symbol: 'cup (US)', toBaseFactor: 0.2365882365 },
      { id: 'pt_us', label: 'US Pints (pt)', symbol: 'pt (US)', toBaseFactor: 0.473176473 },
      { id: 'qt_us', label: 'US Quarts (qt)', symbol: 'qt (US)', toBaseFactor: 0.946352946 },
      { id: 'gal_us', label: 'US Gallons (gal)', symbol: 'gal (US)', toBaseFactor: 3.785411784 },
      { id: 'gal_uk', label: 'Imperial (UK) Gallons', symbol: 'gal (UK)', toBaseFactor: 4.54609 },
    ],
  },
  'extra-19-temperature': {
    toolId: 'extra-19-temperature',
    defaultFrom: 'C',
    defaultTo: 'F',
    defaultValue: 25,
    units: [
      { id: 'C', label: 'Celsius (°C)', symbol: '°C' },
      { id: 'F', label: 'Fahrenheit (°F)', symbol: '°F' },
      { id: 'K', label: 'Kelvin (K)', symbol: 'K' },
    ],
  },
  'extra-20-area': {
    toolId: 'extra-20-area',
    defaultFrom: 'm2',
    defaultTo: 'ft2',
    defaultValue: 100,
    units: [
      { id: 'mm2', label: 'Square Millimeters (mm²)', symbol: 'mm²', toBaseFactor: 1e-6 },
      { id: 'cm2', label: 'Square Centimeters (cm²)', symbol: 'cm²', toBaseFactor: 1e-4 },
      { id: 'm2', label: 'Square Meters (m²)', symbol: 'm²', toBaseFactor: 1 },
      { id: 'km2', label: 'Square Kilometers (km²)', symbol: 'km²', toBaseFactor: 1e6 },
      { id: 'ft2', label: 'Square Feet (ft²)', symbol: 'ft²', toBaseFactor: 0.09290304 },
      { id: 'yd2', label: 'Square Yards (yd²)', symbol: 'yd²', toBaseFactor: 0.83612736 },
      { id: 'acre', label: 'Acres (ac)', symbol: 'ac', toBaseFactor: 4046.8564224 },
      { id: 'ha', label: 'Hectares (ha)', symbol: 'ha', toBaseFactor: 10000 },
    ],
  },
  'extra-21-time-units': {
    toolId: 'extra-21-time-units',
    defaultFrom: 'hr',
    defaultTo: 'min',
    defaultValue: 24,
    units: [
      { id: 'ms', label: 'Milliseconds (ms)', symbol: 'ms', toBaseFactor: 0.001 },
      { id: 's', label: 'Seconds (s)', symbol: 's', toBaseFactor: 1 },
      { id: 'min', label: 'Minutes (min)', symbol: 'min', toBaseFactor: 60 },
      { id: 'hr', label: 'Hours (hr)', symbol: 'hr', toBaseFactor: 3600 },
      { id: 'day', label: 'Days (d)', symbol: 'days', toBaseFactor: 86400 },
      { id: 'week', label: 'Weeks (wk)', symbol: 'weeks', toBaseFactor: 604800 },
      { id: 'month', label: 'Months (avg 30.4375 d)', symbol: 'months', toBaseFactor: 2629800 },
      { id: 'year', label: 'Years (365.25 d)', symbol: 'years', toBaseFactor: 31557600 },
    ],
  },
  'extra-22-energy': {
    toolId: 'extra-22-energy',
    defaultFrom: 'kWh',
    defaultTo: 'kJ',
    defaultValue: 1,
    units: [
      { id: 'J', label: 'Joules (J)', symbol: 'J', toBaseFactor: 1 },
      { id: 'kJ', label: 'Kilojoules (kJ)', symbol: 'kJ', toBaseFactor: 1000 },
      { id: 'cal', label: 'Gram Calories (cal)', symbol: 'cal', toBaseFactor: 4.184 },
      { id: 'kcal', label: 'Kilocalories / Food Cal (kcal)', symbol: 'kcal', toBaseFactor: 4184 },
      { id: 'Wh', label: 'Watt-hours (Wh)', symbol: 'Wh', toBaseFactor: 3600 },
      { id: 'kWh', label: 'Kilowatt-hours (kWh)', symbol: 'kWh', toBaseFactor: 3600000 },
    ],
  },
  'extra-23-power': {
    toolId: 'extra-23-power',
    defaultFrom: 'kW',
    defaultTo: 'hp_mech',
    defaultValue: 150,
    units: [
      { id: 'W', label: 'Watts (W)', symbol: 'W', toBaseFactor: 1 },
      { id: 'kW', label: 'Kilowatts (kW)', symbol: 'kW', toBaseFactor: 1000 },
      { id: 'MW', label: 'Megawatts (MW)', symbol: 'MW', toBaseFactor: 1e6 },
      { id: 'hp_mech', label: 'Mechanical Horsepower (hp)', symbol: 'hp (I)', toBaseFactor: 745.699872 },
      { id: 'hp_metric', label: 'Metric Horsepower (PS / cv)', symbol: 'hp (M)', toBaseFactor: 735.49875 },
    ],
  },
  'extra-24-fuel-economy': {
    toolId: 'extra-24-fuel-economy',
    defaultFrom: 'L/100km',
    defaultTo: 'mpg_us',
    defaultValue: 7.5,
    units: [
      { id: 'km/L', label: 'Kilometers per Liter (km/L)', symbol: 'km/L' },
      { id: 'L/100km', label: 'Liters per 100 km (L/100km)', symbol: 'L/100km' },
      { id: 'mpg_us', label: 'US Miles per Gallon (US MPG)', symbol: 'MPG (US)' },
      { id: 'mpg_uk', label: 'Imperial Miles per Gallon (UK MPG)', symbol: 'MPG (UK)' },
    ],
  },
  'extra-25-frequency': {
    toolId: 'extra-25-frequency',
    defaultFrom: 'Hz',
    defaultTo: 'RPM',
    defaultValue: 60,
    units: [
      { id: 'Hz', label: 'Hertz (Hz)', symbol: 'Hz', toBaseFactor: 1 },
      { id: 'kHz', label: 'Kilohertz (kHz)', symbol: 'kHz', toBaseFactor: 1e3 },
      { id: 'MHz', label: 'Megahertz (MHz)', symbol: 'MHz', toBaseFactor: 1e6 },
      { id: 'GHz', label: 'Gigahertz (GHz)', symbol: 'GHz', toBaseFactor: 1e9 },
      { id: 'RPM', label: 'Revolutions per Minute (RPM)', symbol: 'RPM', toBaseFactor: 1 / 60 },
    ],
  },
  'extra-26-angle': {
    toolId: 'extra-26-angle',
    defaultFrom: 'deg',
    defaultTo: 'rad',
    defaultValue: 180,
    units: [
      { id: 'deg', label: 'Degrees (°)', symbol: '°', toBaseFactor: 1 },
      { id: 'rad', label: 'Radians (rad)', symbol: 'rad', toBaseFactor: 180 / Math.PI },
      { id: 'grad', label: 'Gradians (grad / gon)', symbol: 'grad', toBaseFactor: 0.9 },
      { id: 'arcmin', label: 'Arcminutes (′)', symbol: '′', toBaseFactor: 1 / 60 },
      { id: 'arcsec', label: 'Arcseconds (″)', symbol: '″', toBaseFactor: 1 / 3600 },
    ],
  },
};

export function convertUnitValue(
  toolId: string,
  value: number,
  fromUnitId: string,
  toUnitId: string
): { value: number | null; warning?: string } {
  if (!Number.isFinite(value)) {
    return { value: null, warning: 'Enter a valid numeric value.' };
  }

  // #19 Affine Temperature Scale Conversion
  if (toolId === 'extra-19-temperature') {
    let celsius = value;
    if (fromUnitId === 'F') celsius = ((value - 32) * 5) / 9;
    else if (fromUnitId === 'K') celsius = value - 273.15;

    if (celsius < -273.1500001) {
      return {
        value: null,
        warning: 'Value is below absolute zero (0 K / -273.15 °C).',
      };
    }

    let out = celsius;
    if (toUnitId === 'F') out = (celsius * 9) / 5 + 32;
    else if (toUnitId === 'K') out = celsius + 273.15;
    return { value: roundClean(out, 6) };
  }

  // #24 Fuel Economy Converter (with strict 0 / negative guard for reciprocal L/100km)
  if (toolId === 'extra-24-fuel-economy') {
    if (value <= 0) {
      return {
        value: null,
        warning: 'Fuel economy values must be greater than 0 to compute reciprocal consumption.',
      };
    }
    const KM_L_TO_MPG_US = 2.352145833;
    const KM_L_TO_MPG_UK = 2.824809363;

    let kmPerLiter = value;
    if (fromUnitId === 'L/100km') {
      kmPerLiter = 100 / value;
    } else if (fromUnitId === 'mpg_us') {
      kmPerLiter = value / KM_L_TO_MPG_US;
    } else if (fromUnitId === 'mpg_uk') {
      kmPerLiter = value / KM_L_TO_MPG_UK;
    }

    let out = kmPerLiter;
    if (toUnitId === 'L/100km') {
      out = 100 / kmPerLiter;
    } else if (toUnitId === 'mpg_us') {
      out = kmPerLiter * KM_L_TO_MPG_US;
    } else if (toUnitId === 'mpg_uk') {
      out = kmPerLiter * KM_L_TO_MPG_UK;
    }

    return { value: roundClean(out, 6) };
  }

  // Standard Linear Factor Converters
  const cfg = UNIT_CONVERTER_CONFIGS[toolId];
  if (!cfg) return { value: null, warning: 'Unknown converter tool.' };

  const fromDef = cfg.units.find((u) => u.id === fromUnitId);
  const toDef = cfg.units.find((u) => u.id === toUnitId);
  if (!fromDef?.toBaseFactor || !toDef?.toBaseFactor) {
    return { value: null, warning: 'Invalid unit selection.' };
  }

  const baseVal = value * fromDef.toBaseFactor;
  const targetVal = baseVal / toDef.toBaseFactor;
  return { value: roundClean(targetVal, 8) };
}

// ============================================================================
// #31 US NAVY BODY FAT & LEAN MASS ESTIMATOR (WITH LOG10 DOMAIN GUARD)
// ============================================================================

export interface BodyFatResult {
  valid: boolean;
  error?: string;
  navyBodyFatPct: number;
  bmiBodyFatPct: number;
  fatMassKg: number;
  leanMassKg: number;
  category: string;
}

export function calculateUsNavyBodyFat(params: {
  sex: 'male' | 'female';
  age: number;
  weightKg: number;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm: number;
}): BodyFatResult {
  const { sex, age, weightKg, heightCm, neckCm, waistCm, hipCm } = params;
  if (heightCm <= 0 || weightKg <= 0 || neckCm <= 0 || waistCm <= 0) {
    return {
      valid: false,
      error: 'Height, weight, neck, and waist measurements must all be greater than 0.',
      navyBodyFatPct: 0,
      bmiBodyFatPct: 0,
      fatMassKg: 0,
      leanMassKg: 0,
      category: 'Invalid Input',
    };
  }

  let navyPct = 0;
  if (sex === 'male') {
    if (waistCm <= neckCm) {
      return {
        valid: false,
        error: 'Validation Guard: Waist circumference must be greater than neck circumference for the US Navy logarithmic formula.',
        navyBodyFatPct: 0,
        bmiBodyFatPct: 0,
        fatMassKg: 0,
        leanMassKg: 0,
        category: 'Check Measurements',
      };
    }
    navyPct =
      495 /
        (1.0324 -
          0.19077 * Math.log10(waistCm - neckCm) +
          0.15456 * Math.log10(heightCm)) -
      450;
  } else {
    if (hipCm <= 0 || waistCm + hipCm <= neckCm) {
      return {
        valid: false,
        error: 'Validation Guard: Waist + Hip circumference must be greater than neck circumference for the US Navy logarithmic formula.',
        navyBodyFatPct: 0,
        bmiBodyFatPct: 0,
        fatMassKg: 0,
        leanMassKg: 0,
        category: 'Check Measurements',
      };
    }
    navyPct =
      495 /
        (1.29579 -
          0.35004 * Math.log10(waistCm + hipCm - neckCm) +
          0.221 * Math.log10(heightCm)) -
      450;
  }

  const clampedNavy = Math.max(2, Math.min(70, roundClean(navyPct, 2)));
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const sexFlag = sex === 'male' ? 1 : 0;
  const bmiFat = Math.max(
    2,
    Math.min(70, roundClean(1.2 * bmi + 0.23 * Math.max(18, age) - 10.8 * sexFlag - 5.4, 2))
  );

  const fatMassKg = roundClean((weightKg * clampedNavy) / 100, 2);
  const leanMassKg = roundClean(weightKg - fatMassKg, 2);

  let category = 'Fitness';
  if (sex === 'male') {
    if (clampedNavy < 6) category = 'Essential Fat (2–5%)';
    else if (clampedNavy < 14) category = 'Athletes (6–13%)';
    else if (clampedNavy < 18) category = 'Fitness (14–17%)';
    else if (clampedNavy < 25) category = 'Acceptable / Average (18–24%)';
    else category = 'Elevated / Obese (25%+)';
  } else {
    if (clampedNavy < 14) category = 'Essential Fat (10–13%)';
    else if (clampedNavy < 21) category = 'Athletes (14–20%)';
    else if (clampedNavy < 25) category = 'Fitness (21–24%)';
    else if (clampedNavy < 32) category = 'Acceptable / Average (25–31%)';
    else category = 'Elevated / Obese (32%+)';
  }

  return {
    valid: true,
    navyBodyFatPct: clampedNavy,
    bmiBodyFatPct: bmiFat,
    fatMassKg,
    leanMassKg,
    category,
  };
}

// ============================================================================
// #32 ONE-REP MAX (1RM) STRENGTH CALCULATOR (WITH BRZYCKI r >= 37 GUARD)
// ============================================================================

export interface OneRepMaxResult {
  valid: boolean;
  warning?: string;
  epley1RM: number;
  brzycki1RM: number;
  average1RM: number;
  percentageTable: { pct: number; weight: number; estReps: string }[];
}

export function calculateOneRepMax(weight: number, reps: number): OneRepMaxResult {
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps < 1) {
    return {
      valid: false,
      warning: 'Enter a positive weight lifted and at least 1 repetition.',
      epley1RM: 0,
      brzycki1RM: 0,
      average1RM: 0,
      percentageTable: [],
    };
  }

  if (reps === 1) {
    const loads = [
      { pct: 95, estReps: '2 reps' },
      { pct: 90, estReps: '3–4 reps' },
      { pct: 85, estReps: '5–6 reps' },
      { pct: 80, estReps: '7–8 reps' },
      { pct: 75, estReps: '10 reps' },
      { pct: 70, estReps: '12 reps' },
      { pct: 60, estReps: '15–20 reps' },
    ].map((row) => ({
      ...row,
      weight: roundClean((weight * row.pct) / 100, 1),
    }));

    return {
      valid: true,
      epley1RM: roundClean(weight, 1),
      brzycki1RM: roundClean(weight, 1),
      average1RM: roundClean(weight, 1),
      percentageTable: loads,
    };
  }

  const epley = weight * (1 + reps / 30);
  let brzycki: number;
  let warning: string | undefined;

  if (reps >= 37) {
    // Guard against Brzycki 36 / (37 - r) division by zero or negative denominator
    brzycki = epley;
    warning =
      'Note: Brzycki formula denominator (37 − reps) is only defined for < 37 reps; high-rep Brzycki estimate safely clamped to Epley model.';
  } else {
    brzycki = weight * (36 / (37 - reps));
  }

  const avg = (epley + brzycki) / 2;
  const loads = [
    { pct: 95, estReps: '2 reps' },
    { pct: 90, estReps: '3–4 reps' },
    { pct: 85, estReps: '5–6 reps' },
    { pct: 80, estReps: '7–8 reps' },
    { pct: 75, estReps: '10 reps' },
    { pct: 70, estReps: '12 reps' },
    { pct: 60, estReps: '15–20 reps' },
  ].map((row) => ({
    ...row,
    weight: roundClean((avg * row.pct) / 100, 1),
  }));

  return {
    valid: true,
    warning,
    epley1RM: roundClean(epley, 1),
    brzycki1RM: roundClean(brzycki, 1),
    average1RM: roundClean(avg, 1),
    percentageTable: loads,
  };
}

// ============================================================================
// WORKBENCH RESULT ENGINEERING UNIT AUTO-CONVERTER (SI <-> IMPERIAL BRIDGE)
// ============================================================================

export type EngineeringBridgeDimension =
  | 'length'
  | 'mass'
  | 'temperature'
  | 'pressure'
  | 'force-torque'
  | 'power-energy'
  | 'area-volume'
  | 'speed';

export interface EngineeringBridgeDimensionMeta {
  id: EngineeringBridgeDimension;
  label: string;
  shortLabel: string;
}

export const ENGINEERING_BRIDGE_DIMENSIONS: EngineeringBridgeDimensionMeta[] = [
  { id: 'length', label: 'Length & Distance (m / mm / km ↔ ft / in / mi)', shortLabel: 'Length (SI ↔ Imp)' },
  { id: 'mass', label: 'Mass & Weight (kg / g / t ↔ lb / oz / st)', shortLabel: 'Mass (SI ↔ Imp)' },
  { id: 'temperature', label: 'Temperature (°C / K ↔ °F)', shortLabel: 'Temp (°C ↔ °F)' },
  { id: 'pressure', label: 'Pressure & Stress (kPa / bar / MPa ↔ psi / atm)', shortLabel: 'Pressure (SI ↔ psi)' },
  { id: 'force-torque', label: 'Force & Torque (N / kN / N·m ↔ lbf / ft·lb)', shortLabel: 'Force & Torque' },
  { id: 'power-energy', label: 'Power & Energy (kW / W / kJ ↔ hp / BTU / ft·lbf)', shortLabel: 'Power & Energy' },
  { id: 'area-volume', label: 'Area & Volume (m² / L / m³ ↔ ft² / gal US / ft³)', shortLabel: 'Area & Volume' },
  { id: 'speed', label: 'Speed & Velocity (m/s / km/h ↔ mph / ft/s / kn)', shortLabel: 'Speed (SI ↔ Imp)' },
];

export interface EngineeringUnitPairConversion {
  pairLabel: string;
  fromFormatted: string;
  toFormatted: string;
  formulaHint: string;
}

export function inferDefaultBridgeDimensionForTool(toolId: string): EngineeringBridgeDimension {
  if (toolId === 'extra-13-length') return 'length';
  if (
    toolId === 'extra-14-weight-mass' ||
    toolId === 'extra-29-bmi' ||
    toolId === 'extra-30-bmr-tdee' ||
    toolId === 'extra-31-body-fat' ||
    toolId === 'extra-32-one-rep-max'
  ) {
    return 'mass';
  }
  if (toolId === 'extra-15-area' || toolId === 'extra-16-volume') return 'area-volume';
  if (toolId === 'extra-17-speed' || toolId === 'extra-24-fuel-economy') return 'speed';
  if (toolId === 'extra-19-temperature') return 'temperature';
  if (toolId === 'extra-20-pressure') return 'pressure';
  if (toolId === 'extra-21-force-torque') return 'force-torque';
  if (toolId === 'extra-22-energy' || toolId === 'extra-23-power') return 'power-energy';
  return 'length';
}

/**
 * Converts a numeric result value across common SI <-> Imperial engineering pairs
 * for immediate inspection inside the workbench display panel.
 */
export function convertWorkbenchResultUnits(
  rawValue: number,
  dimension: EngineeringBridgeDimension,
  direction: 'si-to-imperial' | 'imperial-to-si' = 'si-to-imperial'
): EngineeringUnitPairConversion[] {
  const val = Number.isFinite(rawValue) ? rawValue : 0;
  const siToImp = direction === 'si-to-imperial';

  switch (dimension) {
    case 'length':
      return siToImp
        ? [
            {
              pairLabel: 'Meters → Feet',
              fromFormatted: `${formatCleanNumber(val, 6)} m`,
              toFormatted: `${formatCleanNumber(val / 0.3048, 6)} ft`,
              formulaHint: '1 m = 3.28084 ft',
            },
            {
              pairLabel: 'Millimeters → Inches',
              fromFormatted: `${formatCleanNumber(val, 6)} mm`,
              toFormatted: `${formatCleanNumber(val / 25.4, 6)} in`,
              formulaHint: '1 in = 25.4 mm',
            },
            {
              pairLabel: 'Kilometers → Miles',
              fromFormatted: `${formatCleanNumber(val, 6)} km`,
              toFormatted: `${formatCleanNumber(val / 1.609344, 6)} mi`,
              formulaHint: '1 mi = 1.609344 km',
            },
          ]
        : [
            {
              pairLabel: 'Feet → Meters',
              fromFormatted: `${formatCleanNumber(val, 6)} ft`,
              toFormatted: `${formatCleanNumber(val * 0.3048, 6)} m`,
              formulaHint: '1 ft = 0.3048 m',
            },
            {
              pairLabel: 'Inches → Millimeters',
              fromFormatted: `${formatCleanNumber(val, 6)} in`,
              toFormatted: `${formatCleanNumber(val * 25.4, 6)} mm`,
              formulaHint: '1 in = 25.4 mm',
            },
            {
              pairLabel: 'Miles → Kilometers',
              fromFormatted: `${formatCleanNumber(val, 6)} mi`,
              toFormatted: `${formatCleanNumber(val * 1.609344, 6)} km`,
              formulaHint: '1 mi = 1.609344 km',
            },
          ];

    case 'mass':
      return siToImp
        ? [
            {
              pairLabel: 'Kilograms → Pounds',
              fromFormatted: `${formatCleanNumber(val, 6)} kg`,
              toFormatted: `${formatCleanNumber(val / 0.45359237, 6)} lb`,
              formulaHint: '1 kg = 2.204623 lb',
            },
            {
              pairLabel: 'Grams → Ounces',
              fromFormatted: `${formatCleanNumber(val, 6)} g`,
              toFormatted: `${formatCleanNumber(val / 28.349523125, 6)} oz`,
              formulaHint: '1 oz = 28.3495 g',
            },
            {
              pairLabel: 'Metric Tonnes → US Short Tons',
              fromFormatted: `${formatCleanNumber(val, 6)} t`,
              toFormatted: `${formatCleanNumber(val / 0.90718474, 6)} ton (US)`,
              formulaHint: '1 t = 1.10231 ton (US)',
            },
          ]
        : [
            {
              pairLabel: 'Pounds → Kilograms',
              fromFormatted: `${formatCleanNumber(val, 6)} lb`,
              toFormatted: `${formatCleanNumber(val * 0.45359237, 6)} kg`,
              formulaHint: '1 lb = 0.453592 kg',
            },
            {
              pairLabel: 'Ounces → Grams',
              fromFormatted: `${formatCleanNumber(val, 6)} oz`,
              toFormatted: `${formatCleanNumber(val * 28.349523125, 6)} g`,
              formulaHint: '1 oz = 28.3495 g',
            },
            {
              pairLabel: 'US Short Tons → Metric Tonnes',
              fromFormatted: `${formatCleanNumber(val, 6)} ton (US)`,
              toFormatted: `${formatCleanNumber(val * 0.90718474, 6)} t`,
              formulaHint: '1 ton (US) = 0.907185 t',
            },
          ];

    case 'temperature':
      return siToImp
        ? [
            {
              pairLabel: 'Celsius → Fahrenheit',
              fromFormatted: `${formatCleanNumber(val, 4)} °C`,
              toFormatted: `${formatCleanNumber((val * 9) / 5 + 32, 4)} °F`,
              formulaHint: '°F = (°C × 9/5) + 32',
            },
            {
              pairLabel: 'Celsius → Kelvin (SI Base)',
              fromFormatted: `${formatCleanNumber(val, 4)} °C`,
              toFormatted: `${formatCleanNumber(val + 273.15, 4)} K`,
              formulaHint: 'K = °C + 273.15',
            },
            {
              pairLabel: 'Kelvin → Fahrenheit',
              fromFormatted: `${formatCleanNumber(val, 4)} K`,
              toFormatted: `${formatCleanNumber(((val - 273.15) * 9) / 5 + 32, 4)} °F`,
              formulaHint: '°F = (K − 273.15) × 9/5 + 32',
            },
          ]
        : [
            {
              pairLabel: 'Fahrenheit → Celsius',
              fromFormatted: `${formatCleanNumber(val, 4)} °F`,
              toFormatted: `${formatCleanNumber(((val - 32) * 5) / 9, 4)} °C`,
              formulaHint: '°C = (°F − 32) × 5/9',
            },
            {
              pairLabel: 'Fahrenheit → Kelvin (SI Base)',
              fromFormatted: `${formatCleanNumber(val, 4)} °F`,
              toFormatted: `${formatCleanNumber(((val - 32) * 5) / 9 + 273.15, 4)} K`,
              formulaHint: 'K = (°F − 32) × 5/9 + 273.15',
            },
            {
              pairLabel: 'Rankine → Kelvin',
              fromFormatted: `${formatCleanNumber(val, 4)} °R`,
              toFormatted: `${formatCleanNumber(val * (5 / 9), 4)} K`,
              formulaHint: 'K = °R × 5/9',
            },
          ];

    case 'pressure':
      return siToImp
        ? [
            {
              pairLabel: 'Kilopascals → PSI',
              fromFormatted: `${formatCleanNumber(val, 6)} kPa`,
              toFormatted: `${formatCleanNumber(val / 6.89475729, 6)} psi`,
              formulaHint: '1 psi = 6.89476 kPa',
            },
            {
              pairLabel: 'Bar → PSI',
              fromFormatted: `${formatCleanNumber(val, 6)} bar`,
              toFormatted: `${formatCleanNumber(val * 14.5037738, 6)} psi`,
              formulaHint: '1 bar = 14.5038 psi',
            },
            {
              pairLabel: 'Megapascals → ksi (kip/in²)',
              fromFormatted: `${formatCleanNumber(val, 6)} MPa`,
              toFormatted: `${formatCleanNumber(val / 6.89475729, 6)} ksi`,
              formulaHint: '1 ksi = 6.89476 MPa',
            },
          ]
        : [
            {
              pairLabel: 'PSI → Kilopascals',
              fromFormatted: `${formatCleanNumber(val, 6)} psi`,
              toFormatted: `${formatCleanNumber(val * 6.89475729, 6)} kPa`,
              formulaHint: '1 psi = 6.89476 kPa',
            },
            {
              pairLabel: 'PSI → Bar',
              fromFormatted: `${formatCleanNumber(val, 6)} psi`,
              toFormatted: `${formatCleanNumber(val / 14.5037738, 6)} bar`,
              formulaHint: '1 bar = 14.5038 psi',
            },
            {
              pairLabel: 'ksi → Megapascals',
              fromFormatted: `${formatCleanNumber(val, 6)} ksi`,
              toFormatted: `${formatCleanNumber(val * 6.89475729, 6)} MPa`,
              formulaHint: '1 ksi = 6.89476 MPa',
            },
          ];

    case 'force-torque':
      return siToImp
        ? [
            {
              pairLabel: 'Newtons → Pound-force (lbf)',
              fromFormatted: `${formatCleanNumber(val, 6)} N`,
              toFormatted: `${formatCleanNumber(val / 4.448221615, 6)} lbf`,
              formulaHint: '1 lbf = 4.44822 N',
            },
            {
              pairLabel: 'Newton-meters → Foot-pounds (ft·lb)',
              fromFormatted: `${formatCleanNumber(val, 6)} N·m`,
              toFormatted: `${formatCleanNumber(val / 1.355817948, 6)} ft·lb`,
              formulaHint: '1 ft·lb = 1.35582 N·m',
            },
            {
              pairLabel: 'Kilonewtons → Kip-force (kip)',
              fromFormatted: `${formatCleanNumber(val, 6)} kN`,
              toFormatted: `${formatCleanNumber(val / 4.448221615, 6)} kip`,
              formulaHint: '1 kip = 4.44822 kN',
            },
          ]
        : [
            {
              pairLabel: 'Pound-force → Newtons',
              fromFormatted: `${formatCleanNumber(val, 6)} lbf`,
              toFormatted: `${formatCleanNumber(val * 4.448221615, 6)} N`,
              formulaHint: '1 lbf = 4.44822 N',
            },
            {
              pairLabel: 'Foot-pounds → Newton-meters',
              fromFormatted: `${formatCleanNumber(val, 6)} ft·lb`,
              toFormatted: `${formatCleanNumber(val * 1.355817948, 6)} N·m`,
              formulaHint: '1 ft·lb = 1.35582 N·m',
            },
            {
              pairLabel: 'Kip-force → Kilonewtons',
              fromFormatted: `${formatCleanNumber(val, 6)} kip`,
              toFormatted: `${formatCleanNumber(val * 4.448221615, 6)} kN`,
              formulaHint: '1 kip = 4.44822 kN',
            },
          ];

    case 'power-energy':
      return siToImp
        ? [
            {
              pairLabel: 'Kilowatts → Mechanical Horsepower',
              fromFormatted: `${formatCleanNumber(val, 6)} kW`,
              toFormatted: `${formatCleanNumber(val / 0.745699872, 6)} hp`,
              formulaHint: '1 hp = 0.7457 kW',
            },
            {
              pairLabel: 'Kilojoules → BTU (IT)',
              fromFormatted: `${formatCleanNumber(val, 6)} kJ`,
              toFormatted: `${formatCleanNumber(val / 1.05505585, 6)} BTU`,
              formulaHint: '1 BTU = 1.05506 kJ',
            },
            {
              pairLabel: 'Joules → Foot-pounds Energy',
              fromFormatted: `${formatCleanNumber(val, 6)} J`,
              toFormatted: `${formatCleanNumber(val / 1.35581795, 6)} ft·lbf`,
              formulaHint: '1 ft·lbf = 1.35582 J',
            },
          ]
        : [
            {
              pairLabel: 'Mechanical Horsepower → Kilowatts',
              fromFormatted: `${formatCleanNumber(val, 6)} hp`,
              toFormatted: `${formatCleanNumber(val * 0.745699872, 6)} kW`,
              formulaHint: '1 hp = 0.7457 kW',
            },
            {
              pairLabel: 'BTU (IT) → Kilojoules',
              fromFormatted: `${formatCleanNumber(val, 6)} BTU`,
              toFormatted: `${formatCleanNumber(val * 1.05505585, 6)} kJ`,
              formulaHint: '1 BTU = 1.05506 kJ',
            },
            {
              pairLabel: 'Foot-pounds Energy → Joules',
              fromFormatted: `${formatCleanNumber(val, 6)} ft·lbf`,
              toFormatted: `${formatCleanNumber(val * 1.35581795, 6)} J`,
              formulaHint: '1 ft·lbf = 1.35582 J',
            },
          ];

    case 'area-volume':
      return siToImp
        ? [
            {
              pairLabel: 'Square Meters → Square Feet',
              fromFormatted: `${formatCleanNumber(val, 6)} m²`,
              toFormatted: `${formatCleanNumber(val / 0.09290304, 6)} ft²`,
              formulaHint: '1 m² = 10.7639 ft²',
            },
            {
              pairLabel: 'Liters → US Liquid Gallons',
              fromFormatted: `${formatCleanNumber(val, 6)} L`,
              toFormatted: `${formatCleanNumber(val / 3.785411784, 6)} gal (US)`,
              formulaHint: '1 gal (US) = 3.78541 L',
            },
            {
              pairLabel: 'Cubic Meters → Cubic Feet',
              fromFormatted: `${formatCleanNumber(val, 6)} m³`,
              toFormatted: `${formatCleanNumber(val / 0.0283168466, 6)} ft³`,
              formulaHint: '1 m³ = 35.3147 ft³',
            },
          ]
        : [
            {
              pairLabel: 'Square Feet → Square Meters',
              fromFormatted: `${formatCleanNumber(val, 6)} ft²`,
              toFormatted: `${formatCleanNumber(val * 0.09290304, 6)} m²`,
              formulaHint: '1 ft² = 0.092903 m²',
            },
            {
              pairLabel: 'US Liquid Gallons → Liters',
              fromFormatted: `${formatCleanNumber(val, 6)} gal (US)`,
              toFormatted: `${formatCleanNumber(val * 3.785411784, 6)} L`,
              formulaHint: '1 gal (US) = 3.78541 L',
            },
            {
              pairLabel: 'Cubic Feet → Cubic Meters',
              fromFormatted: `${formatCleanNumber(val, 6)} ft³`,
              toFormatted: `${formatCleanNumber(val * 0.0283168466, 6)} m³`,
              formulaHint: '1 ft³ = 0.028317 m³',
            },
          ];

    case 'speed':
    default:
      return siToImp
        ? [
            {
              pairLabel: 'Meters/sec → Feet/sec',
              fromFormatted: `${formatCleanNumber(val, 6)} m/s`,
              toFormatted: `${formatCleanNumber(val / 0.3048, 6)} ft/s`,
              formulaHint: '1 m/s = 3.28084 ft/s',
            },
            {
              pairLabel: 'Kilometers/hr → Miles/hr (MPH)',
              fromFormatted: `${formatCleanNumber(val, 6)} km/h`,
              toFormatted: `${formatCleanNumber(val / 1.609344, 6)} mph`,
              formulaHint: '1 mph = 1.60934 km/h',
            },
            {
              pairLabel: 'Kilometers/hr → Knots (nautical)',
              fromFormatted: `${formatCleanNumber(val, 6)} km/h`,
              toFormatted: `${formatCleanNumber(val / 1.852, 6)} kn`,
              formulaHint: '1 kn = 1.852 km/h',
            },
          ]
        : [
            {
              pairLabel: 'Feet/sec → Meters/sec',
              fromFormatted: `${formatCleanNumber(val, 6)} ft/s`,
              toFormatted: `${formatCleanNumber(val * 0.3048, 6)} m/s`,
              formulaHint: '1 ft/s = 0.3048 m/s',
            },
            {
              pairLabel: 'Miles/hr (MPH) → Kilometers/hr',
              fromFormatted: `${formatCleanNumber(val, 6)} mph`,
              toFormatted: `${formatCleanNumber(val * 1.609344, 6)} km/h`,
              formulaHint: '1 mph = 1.60934 km/h',
            },
            {
              pairLabel: 'Knots → Kilometers/hr',
              fromFormatted: `${formatCleanNumber(val, 6)} kn`,
              toFormatted: `${formatCleanNumber(val * 1.852, 6)} km/h`,
              formulaHint: '1 kn = 1.852 km/h',
            },
          ];
  }
}

// ============================================================================
// #33 LOAN & MORTGAGE EMI AMORTIZATION CALCULATOR
// ============================================================================
export interface LoanAmortizationYearRow {
  year: number;
  openingBalance: number;
  principalPaid: number;
  interestPaid: number;
  extraPaid: number;
  closingBalance: number;
}

export interface LoanEmiResult {
  monthlyEmi: number;
  totalPayment: number;
  totalInterest: number;
  principalPercent: number;
  interestPercent: number;
  payoffMonthsWithExtra: number;
  interestSavedWithExtra: number;
  yearlySchedule: LoanAmortizationYearRow[];
  error?: string;
}

export function calculateLoanEmiAmortization(
  principalAmount: number,
  annualRatePercent: number,
  tenureYears: number,
  extraMonthlyPayment = 0
): LoanEmiResult {
  if (
    !Number.isFinite(principalAmount) ||
    principalAmount <= 0 ||
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent < 0 ||
    !Number.isFinite(tenureYears) ||
    tenureYears <= 0
  ) {
    return {
      monthlyEmi: 0,
      totalPayment: 0,
      totalInterest: 0,
      principalPercent: 0,
      interestPercent: 0,
      payoffMonthsWithExtra: 0,
      interestSavedWithExtra: 0,
      yearlySchedule: [],
      error: 'Loan principal and tenure must be positive numbers.',
    };
  }

  const totalMonths = Math.max(1, Math.min(600, Math.round(tenureYears * 12)));
  const monthlyRate = annualRatePercent / 100 / 12;
  const extra = Math.max(0, Number(extraMonthlyPayment) || 0);

  let monthlyEmi = 0;
  if (monthlyRate === 0) {
    monthlyEmi = principalAmount / totalMonths;
  } else {
    const factor = Math.pow(1 + monthlyRate, totalMonths);
    monthlyEmi = (principalAmount * monthlyRate * factor) / (factor - 1);
  }

  const baselineTotalPayment = monthlyEmi * totalMonths;
  const baselineTotalInterest = Math.max(0, baselineTotalPayment - principalAmount);

  // Build actual amortization schedule (accounting for optional extraMonthlyPayment)
  let balance = principalAmount;
  let actualMonths = 0;
  let actualTotalInterest = 0;
  const yearlySchedule: LoanAmortizationYearRow[] = [];

  const maxYears = Math.ceil(totalMonths / 12);
  for (let yr = 1; yr <= maxYears && balance > 0.005; yr++) {
    const openingBalance = balance;
    let yrPrincipal = 0;
    let yrInterest = 0;
    let yrExtra = 0;

    for (let m = 1; m <= 12 && balance > 0.005; m++) {
      actualMonths++;
      const interestForMonth = balance * monthlyRate;
      let principalForMonth = monthlyEmi - interestForMonth;
      if (principalForMonth > balance) {
        principalForMonth = balance;
      }
      let extraForMonth = Math.min(extra, Math.max(0, balance - principalForMonth));
      balance = Math.max(0, balance - principalForMonth - extraForMonth);

      yrInterest += interestForMonth;
      yrPrincipal += principalForMonth;
      yrExtra += extraForMonth;
      actualTotalInterest += interestForMonth;
    }

    yearlySchedule.push({
      year: yr,
      openingBalance,
      principalPaid: yrPrincipal,
      interestPaid: yrInterest,
      extraPaid: yrExtra,
      closingBalance: balance,
    });
  }

  const totalPayment = principalAmount + actualTotalInterest;
  const principalPercent = totalPayment > 0 ? (principalAmount / totalPayment) * 100 : 100;
  const interestPercent = totalPayment > 0 ? (actualTotalInterest / totalPayment) * 100 : 0;
  const interestSavedWithExtra = Math.max(0, baselineTotalInterest - actualTotalInterest);

  return {
    monthlyEmi,
    totalPayment,
    totalInterest: actualTotalInterest,
    principalPercent,
    interestPercent,
    payoffMonthsWithExtra: actualMonths,
    interestSavedWithExtra,
    yearlySchedule,
  };
}

// ============================================================================
// #34 ROI, PROFIT MARGIN & BREAK-EVEN CALCULATOR
// ============================================================================
export interface RoiMarginBreakEvenResult {
  unitContributionMargin: number;
  grossMarginPercent: number;
  markupPercent: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  roiPercent: number;
  breakEvenUnits: number | null;
  breakEvenRevenue: number | null;
  error?: string;
}

export function calculateRoiMarginBreakEven(
  unitCost: number,
  sellingPrice: number,
  unitsSold: number,
  fixedOverheadCost = 0
): RoiMarginBreakEvenResult {
  if (
    !Number.isFinite(unitCost) ||
    unitCost < 0 ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice <= 0 ||
    !Number.isFinite(unitsSold) ||
    unitsSold < 0 ||
    !Number.isFinite(fixedOverheadCost) ||
    fixedOverheadCost < 0
  ) {
    return {
      unitContributionMargin: 0,
      grossMarginPercent: 0,
      markupPercent: 0,
      totalRevenue: 0,
      totalCost: 0,
      netProfit: 0,
      roiPercent: 0,
      breakEvenUnits: null,
      breakEvenRevenue: null,
      error: 'Selling price must be positive and costs must be non-negative.',
    };
  }

  const unitContributionMargin = sellingPrice - unitCost;
  const grossMarginPercent = (unitContributionMargin / sellingPrice) * 100;
  const markupPercent = unitCost > 0 ? (unitContributionMargin / unitCost) * 100 : 100;

  const totalRevenue = sellingPrice * unitsSold;
  const totalVariableCost = unitCost * unitsSold;
  const totalCost = totalVariableCost + fixedOverheadCost;
  const netProfit = totalRevenue - totalCost;
  const roiPercent = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  const breakEvenUnits =
    unitContributionMargin > 0 ? Math.ceil(fixedOverheadCost / unitContributionMargin) : null;
  const breakEvenRevenue = breakEvenUnits !== null ? breakEvenUnits * sellingPrice : null;

  return {
    unitContributionMargin,
    grossMarginPercent,
    markupPercent,
    totalRevenue,
    totalCost,
    netProfit,
    roiPercent,
    breakEvenUnits,
    breakEvenRevenue,
  };
}

// ============================================================================
// #35 OHM'S LAW & ELECTRICAL POWER CALCULATOR
// ============================================================================
export type OhmsSolveMode = 'from-v-i' | 'from-v-r' | 'from-i-r' | 'from-p-v';

export interface OhmsLawResult {
  voltageV: number;
  currentA: number;
  resistanceOhm: number;
  powerW: number;
  powerKw: number;
  seriesReq: number;
  parallelReq: number;
  formulaUsed: string;
  error?: string;
}

export function calculateOhmsLawAndPower(
  mode: OhmsSolveMode,
  inputA: number,
  inputB: number,
  resistorR1 = 100,
  resistorR2 = 220
): OhmsLawResult {
  const r1 = Math.max(0.001, Number(resistorR1) || 100);
  const r2 = Math.max(0.001, Number(resistorR2) || 220);
  const seriesReq = r1 + r2;
  const parallelReq = (r1 * r2) / (r1 + r2);

  if (!Number.isFinite(inputA) || inputA <= 0 || !Number.isFinite(inputB) || inputB <= 0) {
    return {
      voltageV: 0,
      currentA: 0,
      resistanceOhm: 0,
      powerW: 0,
      powerKw: 0,
      seriesReq,
      parallelReq,
      formulaUsed: '',
      error: 'Both electrical input parameters must be positive values.',
    };
  }

  let voltageV = 0;
  let currentA = 0;
  let resistanceOhm = 0;
  let powerW = 0;
  let formulaUsed = '';

  if (mode === 'from-v-i') {
    voltageV = inputA;
    currentA = inputB;
    resistanceOhm = voltageV / currentA;
    powerW = voltageV * currentA;
    formulaUsed = 'R = V / I  ·  P = V × I';
  } else if (mode === 'from-v-r') {
    voltageV = inputA;
    resistanceOhm = inputB;
    currentA = voltageV / resistanceOhm;
    powerW = (voltageV * voltageV) / resistanceOhm;
    formulaUsed = 'I = V / R  ·  P = V² / R';
  } else if (mode === 'from-i-r') {
    currentA = inputA;
    resistanceOhm = inputB;
    voltageV = currentA * resistanceOhm;
    powerW = currentA * currentA * resistanceOhm;
    formulaUsed = 'V = I × R  ·  P = I² × R';
  } else {
    powerW = inputA;
    voltageV = inputB;
    currentA = powerW / voltageV;
    resistanceOhm = (voltageV * voltageV) / powerW;
    formulaUsed = 'I = P / V  ·  R = V² / P';
  }

  return {
    voltageV,
    currentA,
    resistanceOhm,
    powerW,
    powerKw: powerW / 1000,
    seriesReq,
    parallelReq,
    formulaUsed,
  };
}

// ============================================================================
// #36 DESCRIPTIVE STATISTICS & STANDARD DEVIATION
// ============================================================================
export interface DescriptiveStatsResult {
  count: number;
  sum: number;
  mean: number;
  median: number;
  modes: number[];
  min: number;
  max: number;
  range: number;
  sampleStdDev: number;
  populationStdDev: number;
  sampleVariance: number;
  populationVariance: number;
  q1: number;
  q3: number;
  iqr: number;
  sortedValues: number[];
  error?: string;
}

export function calculateDescriptiveStatistics(rawDataset: string): DescriptiveStatsResult {
  const nums = String(rawDataset || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  if (nums.length === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      modes: [],
      min: 0,
      max: 0,
      range: 0,
      sampleStdDev: 0,
      populationStdDev: 0,
      sampleVariance: 0,
      populationVariance: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      sortedValues: [],
      error: 'Enter at least one valid number separated by commas or spaces.',
    };
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  const getMedianOfSlice = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  const median = getMedianOfSlice(sorted);
  const lowerHalf = sorted.slice(0, Math.floor(count / 2));
  const upperHalf = sorted.slice(Math.ceil(count / 2));
  const q1 = lowerHalf.length > 0 ? getMedianOfSlice(lowerHalf) : sorted[0];
  const q3 = upperHalf.length > 0 ? getMedianOfSlice(upperHalf) : sorted[count - 1];
  const iqr = q3 - q1;

  const freqMap = new Map<number, number>();
  let maxFreq = 0;
  for (const n of sorted) {
    const f = (freqMap.get(n) || 0) + 1;
    freqMap.set(n, f);
    if (f > maxFreq) maxFreq = f;
  }
  const modes: number[] = [];
  if (maxFreq > 1) {
    for (const [val, f] of freqMap.entries()) {
      if (f === maxFreq) modes.push(val);
    }
  }

  const sqDiffSum = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  const populationVariance = sqDiffSum / count;
  const sampleVariance = count > 1 ? sqDiffSum / (count - 1) : 0;

  return {
    count,
    sum,
    mean,
    median,
    modes,
    min: sorted[0],
    max: sorted[count - 1],
    range: sorted[count - 1] - sorted[0],
    sampleStdDev: Math.sqrt(sampleVariance),
    populationStdDev: Math.sqrt(populationVariance),
    sampleVariance,
    populationVariance,
    q1,
    q3,
    iqr,
    sortedValues: sorted,
  };
}

// ============================================================================
// #37 TYPOGRAPHY, REM/PX & DPI PRINT CONVERTER
// ============================================================================
export type TypographyUnit = 'px' | 'rem' | 'em' | 'pt' | 'pc' | 'mm' | 'in';

export interface TypographyConversionResult {
  px: number;
  rem: number;
  em: number;
  pt: number;
  pc: number;
  mm: number;
  inches: number;
  cssSnippet: string;
}

export function convertTypographyAndCssUnits(
  value: number,
  fromUnit: TypographyUnit,
  baseFontPx = 16,
  dpi = 96
): TypographyConversionResult {
  const safeVal = Number.isFinite(value) && value >= 0 ? value : 0;
  const rootPx = Math.max(1, Number(baseFontPx) || 16);
  const safeDpi = Math.max(36, Number(dpi) || 96);

  // Convert input into CSS pixels first
  let px = safeVal;
  if (fromUnit === 'rem' || fromUnit === 'em') {
    px = safeVal * rootPx;
  } else if (fromUnit === 'pt') {
    px = (safeVal / 72) * safeDpi;
  } else if (fromUnit === 'pc') {
    px = ((safeVal * 12) / 72) * safeDpi;
  } else if (fromUnit === 'in') {
    px = safeVal * safeDpi;
  } else if (fromUnit === 'mm') {
    px = (safeVal / 25.4) * safeDpi;
  }

  const rem = px / rootPx;
  const em = rem;
  const inches = px / safeDpi;
  const pt = inches * 72;
  const pc = pt / 12;
  const mm = inches * 25.4;

  return {
    px,
    rem,
    em,
    pt,
    pc,
    mm,
    inches,
    cssSnippet: `font-size: ${formatCleanNumber(rem, 4)}rem; /* ${formatCleanNumber(px, 2)}px @ ${rootPx}px root */`,
  };
}

// ============================================================================
// #38 DATA TRANSFER TIME & BANDWIDTH CALCULATOR
// ============================================================================
export interface BandwidthTransferResult {
  totalSeconds: number;
  formattedDuration: string;
  effectiveSpeedMbps: number;
  effectiveBytesPerSec: number;
  speedComparisonTable: Array<{ label: string; mbps: number; formattedTime: string }>;
  error?: string;
}

export function calculateBandwidthTransferTime(
  fileSize: number,
  fileSizeUnit: 'MB' | 'GB' | 'TB' | 'GiB',
  bandwidthSpeed: number,
  bandwidthUnit: 'Mbps' | 'Gbps' | 'MB/s',
  overheadPercent = 5
): BandwidthTransferResult {
  if (!Number.isFinite(fileSize) || fileSize <= 0 || !Number.isFinite(bandwidthSpeed) || bandwidthSpeed <= 0) {
    return {
      totalSeconds: 0,
      formattedDuration: '0s',
      effectiveSpeedMbps: 0,
      effectiveBytesPerSec: 0,
      speedComparisonTable: [],
      error: 'File size and network speed must be positive numbers.',
    };
  }

  const byteMultipliers: Record<string, number> = {
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    GiB: 1024 ** 3,
  };
  const totalBytes = fileSize * (byteMultipliers[fileSizeUnit] || 1e9);
  const totalBits = totalBytes * 8;

  const rawMbps =
    bandwidthUnit === 'Gbps'
      ? bandwidthSpeed * 1000
      : bandwidthUnit === 'MB/s'
      ? bandwidthSpeed * 8
      : bandwidthSpeed;

  const clampedOverhead = Math.max(0, Math.min(40, Number(overheadPercent) || 0));
  const effectiveSpeedMbps = rawMbps * (1 - clampedOverhead / 100);
  const effectiveBitsPerSec = effectiveSpeedMbps * 1e6;
  const effectiveBytesPerSec = effectiveBitsPerSec / 8;

  const formatDurationSeconds = (secs: number): string => {
    if (!Number.isFinite(secs) || secs <= 0) return '0s';
    if (secs < 1) return `${(secs * 1000).toFixed(0)} ms`;
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;
    const parts: string[] = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (remSecs >= 0.05 || parts.length === 0) {
      parts.push(`${hrs === 0 && mins === 0 ? remSecs.toFixed(2) : Math.round(remSecs)}s`);
    }
    return parts.join(' ');
  };

  const totalSeconds = totalBits / effectiveBitsPerSec;
  const presets = [
    { label: '4G LTE Mobile (35 Mbps)', mbps: 35 },
    { label: 'Fast Broadband (100 Mbps)', mbps: 100 },
    { label: '5G / Fiber Half-Gig (500 Mbps)', mbps: 500 },
    { label: '1 Gbps Fiber Optic (1,000 Mbps)', mbps: 1000 },
    { label: '10 Gbps Data Center Link (10,000 Mbps)', mbps: 10000 },
  ];

  const speedComparisonTable = presets.map((p) => {
    const effBits = p.mbps * (1 - clampedOverhead / 100) * 1e6;
    return {
      label: p.label,
      mbps: p.mbps,
      formattedTime: formatDurationSeconds(totalBits / effBits),
    };
  });

  return {
    totalSeconds,
    formattedDuration: formatDurationSeconds(totalSeconds),
    effectiveSpeedMbps,
    effectiveBytesPerSec,
    speedComparisonTable,
  };
}

