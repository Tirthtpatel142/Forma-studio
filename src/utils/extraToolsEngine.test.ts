import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCleanNumber,
  evaluateMathExpression,
  convertBaseBigInt,
  computeBitwiseBigInt,
  simplifyRatioAndProportion,
  convertUnitValue,
  UNIT_CONVERTER_CONFIGS,
  calculateUsNavyBodyFat,
  calculateOneRepMax,
} from './extraToolsEngine';

test('formatCleanNumber strips IEEE-754 floating-point noise like 0.1 + 0.2', () => {
  assert.equal(formatCleanNumber(0.1 + 0.2), '0.3');
  assert.equal(formatCleanNumber(100.000000000001), '100');
});

test('BODMAS & 2D Graphing expression parser supports DEG/RAD and implicit multiplication', () => {
  // DEG mode: sin(30) = 0.5
  const degSin = evaluateMathExpression('sin(30)', {}, 'DEG');
  assert.equal(formatCleanNumber(degSin), '0.5');

  // RAD mode: sin(pi/2) = 1
  const radSin = evaluateMathExpression('sin(pi / 2)', {}, 'RAD');
  assert.equal(formatCleanNumber(radSin), '1');

  // Implicit multiplication: 2(3+4) = 14, (2+1)(3+1) = 12, 3sqrt(16) = 12
  assert.equal(evaluateMathExpression('2(3+4)', {}, 'DEG'), 14);
  assert.equal(evaluateMathExpression('(2+1)(3+1)', {}, 'DEG'), 12);
  assert.equal(evaluateMathExpression('3sqrt(16)', {}, 'DEG'), 12);
  assert.equal(evaluateMathExpression('2x + 5', { x: 4 }, 'RAD'), 13);
});

test('Base / Number System converter uses BigInt for >64-bit precision without overflow', () => {
  const hugeDec = '18446744073709551615'; // 2^64 - 1
  const res = convertBaseBigInt(hugeDec, 10);
  assert.equal(res.valid, true);
  assert.equal(res.hexadecimal, 'FFFFFFFFFFFFFFFF');
  assert.equal(res.binary.length, 64);

  const bit = computeBitwiseBigInt('255', '170', 10);
  assert.equal(bit.andDec, '170');
  assert.equal(bit.xorDec, '85');

  const ratio = simplifyRatioAndProportion(1920, 1080, 1280);
  assert.equal(ratio.simplified, '16 : 9');
  assert.equal(ratio.solvedX, '720');
});

test('All 14 Unit Converters (#13–#26) including affine temperature and guarded fuel economy work', () => {
  assert.equal(Object.keys(UNIT_CONVERTER_CONFIGS).length, 14);

  // #19 Temperature
  const f100 = convertUnitValue('extra-19-temperature', 100, 'C', 'F');
  assert.equal(formatCleanNumber(f100.value ?? 0), '212');
  const k0 = convertUnitValue('extra-19-temperature', 0, 'C', 'K');
  assert.equal(formatCleanNumber(k0.value ?? 0), '273.15');

  // #24 Fuel Economy with zero/negative guard
  const zeroFuel = convertUnitValue('extra-24-fuel-economy', 0, 'L/100km', 'mpg_us');
  assert.equal(zeroFuel.value, null);
  assert.ok(zeroFuel.warning?.includes('greater than 0'));

  const negFuel = convertUnitValue('extra-24-fuel-economy', -5, 'km/L', 'L/100km');
  assert.equal(negFuel.value, null);

  const mpg = convertUnitValue('extra-24-fuel-economy', 8, 'L/100km', 'mpg_us');
  assert.equal(formatCleanNumber(mpg.value ?? 0, 2), '29.4');
});

test('Health/Fitness calculators (#31 US Navy Body Fat & #32 1RM) enforce domain guards', () => {
  // #31 Body Fat guard when waist <= neck
  const invalidBf = calculateUsNavyBodyFat({
    sex: 'male',
    age: 30,
    weightKg: 80,
    heightCm: 180,
    neckCm: 40,
    waistCm: 38,
    hipCm: 96,
  });
  assert.equal(invalidBf.valid, false);
  assert.ok(invalidBf.error?.includes('Waist circumference must be greater than neck'));

  const validBf = calculateUsNavyBodyFat({
    sex: 'male',
    age: 30,
    weightKg: 82,
    heightCm: 180,
    neckCm: 38,
    waistCm: 86,
    hipCm: 96,
  });
  assert.equal(validBf.valid, true);
  assert.ok(validBf.navyBodyFatPct > 10 && validBf.navyBodyFatPct < 25);

  // #32 Brzycki 1RM guard when reps >= 37
  const highReps = calculateOneRepMax(100, 40);
  assert.equal(highReps.valid, true);
  assert.ok(Number.isFinite(highReps.brzycki1RM) && highReps.brzycki1RM > 0);
  assert.ok(highReps.warning?.includes('37'));
});

test('Compound Interest (#4) uses exact periodic rate conversion r_m = (1 + r/k)^(k/m) - 1', async () => {
  const { calculateCompoundInterestExact } = await import('./extraToolsEngine');
  const res = calculateCompoundInterestExact({
    principal: 10000,
    annualRatePct: 8,
    compoundingPerYear: 4,
    years: 10,
    contribution: 500,
    contributionCadence: 'monthly',
  });
  assert.ok(res.finalBalance > 110000);
  assert.equal(res.totalPrincipalContributed, 70000);
  assert.ok(res.totalInterestEarned > 40000);
  assert.ok(res.effectivePeriodicRatePct > 0.6);
});

test('Exact Age (#27) handles Feb 29 leap-year birthdays and rejects future birth dates', async () => {
  const { calculateExactAgeChronological } = await import('./extraToolsEngine');
  const futureRes = calculateExactAgeChronological('2028-05-10', '2026-05-10');
  assert.equal(futureRes.valid, false);
  assert.ok(futureRes.error?.includes('future'));

  const leapRes = calculateExactAgeChronological('2000-02-29', '2025-03-01');
  assert.equal(leapRes.valid, true);
  assert.equal(leapRes.years, 25);
  assert.equal(leapRes.months, 0);
  assert.equal(leapRes.days, 1);
});

test('Cross-studio catalog search & multi-file compare slider (#42) & PDF visual sheet metadata work', async () => {
  const { isMultiFileToolId, searchStudioTools } = await import('../data/toolsCatalog');
  const { buildPdfVisualMeta } = await import('./pdfEngine');

  assert.equal(isMultiFileToolId('img-42-compare-slider'), true);

  const extra5 = searchStudioTools('extra 5');
  assert.ok(extra5.length > 0);
  assert.equal(extra5[0].id, 'extra-5-currency-converter');

  const calc5 = searchStudioTools('calc 5');
  assert.ok(calc5.length > 0);
  assert.equal(calc5[0].id, 'extra-5-currency-converter');

  const conv5 = searchStudioTools('converter 5');
  assert.ok(conv5.length > 0);
  assert.equal(conv5[0].id, 'extra-5-currency-converter');

  const meta = buildPdfVisualMeta('pdf-6-rotate', { angle: '90' });
  assert.equal(meta.rotationDeg, 90);
});

test('numVal preserves explicit 0 while falling back only on empty/null/undefined/NaN, and parseNumInput preserves empty string', async () => {
  const { numVal, parseNumInput } = await import('./extraToolsEngine');
  // 0 inches (e.g. 5 ft 0 in) must return 0, never fallback 9
  assert.equal(numVal(0, 9), 0);
  assert.equal(numVal('0', 9), 0);
  assert.equal(numVal('', 9), 9);
  assert.equal(numVal(undefined, 9), 9);
  assert.equal(numVal(null, 9), 9);

  assert.equal(parseNumInput(''), '');
  assert.equal(parseNumInput('0'), 0);
  assert.equal(parseNumInput('42.5'), 42.5);
});

test('computeZoneUtcDateFromLocalMinutes aligns 30-min and 45-min IANA timezones to the exact minute', async () => {
  const { computeZoneUtcDateFromLocalMinutes, getZoneOffsetMinutesAt } = await import(
    './extraToolsEngine'
  );
  const refDate = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));

  // Asia/Kolkata is UTC+05:30 (+330 minutes)
  assert.equal(getZoneOffsetMinutesAt(refDate, 'Asia/Kolkata'), 330);
  // Setting 14:00 (840 mins) in Asia/Kolkata should produce 08:30 UTC
  const kolkataUtc = computeZoneUtcDateFromLocalMinutes('Asia/Kolkata', 14 * 60, refDate);
  assert.equal(kolkataUtc.getUTCHours(), 8);
  assert.equal(kolkataUtc.getUTCMinutes(), 30);

  // Asia/Kathmandu is UTC+05:45 (+345 minutes)
  assert.equal(getZoneOffsetMinutesAt(refDate, 'Asia/Kathmandu'), 345);
  // Setting 14:00 (840 mins) in Asia/Kathmandu should produce 08:15 UTC
  const kathmanduUtc = computeZoneUtcDateFromLocalMinutes('Asia/Kathmandu', 14 * 60, refDate);
  assert.equal(kathmanduUtc.getUTCHours(), 8);
  assert.equal(kathmanduUtc.getUTCMinutes(), 15);
});

test('convertWorkbenchResultUnits converts result values between SI and Imperial engineering units', async () => {
  const {
    convertWorkbenchResultUnits,
    inferDefaultBridgeDimensionForTool,
    ENGINEERING_BRIDGE_DIMENSIONS,
  } = await import('./extraToolsEngine');

  assert.equal(ENGINEERING_BRIDGE_DIMENSIONS.length, 8);
  assert.equal(inferDefaultBridgeDimensionForTool('extra-20-pressure'), 'pressure');
  assert.equal(inferDefaultBridgeDimensionForTool('extra-19-temperature'), 'temperature');

  const lenSiToImp = convertWorkbenchResultUnits(1, 'length', 'si-to-imperial');
  assert.equal(lenSiToImp.length, 3);
  assert.ok(lenSiToImp[0].toFormatted.includes('3.28084 ft'));

  const tempSiToImp = convertWorkbenchResultUnits(0, 'temperature', 'si-to-imperial');
  assert.equal(tempSiToImp[0].toFormatted, '32 °F');
  assert.equal(tempSiToImp[1].toFormatted, '273.15 K');

  const massImpToSi = convertWorkbenchResultUnits(100, 'mass', 'imperial-to-si');
  assert.ok(massImpToSi[0].toFormatted.includes('45.359237 kg'));
});

test('Expanded Calculator & Converter Tools (#33 Loan EMI, #34 ROI/Margin, #35 Ohms Law, #36 Statistics, #37 Typography CSS, #38 Bandwidth Transfer) compute accurately', async () => {
  const {
    calculateLoanEmiAmortization,
    calculateRoiMarginBreakEven,
    calculateOhmsLawAndPower,
    calculateDescriptiveStatistics,
    convertTypographyAndCssUnits,
    calculateBandwidthTransferTime,
  } = await import('./extraToolsEngine');

  // #33 Loan EMI Amortization
  const emi = calculateLoanEmiAmortization(300000, 6.0, 30, 200);
  assert.ok(emi.monthlyEmi > 1798 && emi.monthlyEmi < 1800);
  assert.ok(emi.interestSavedWithExtra > 50000);
  assert.ok(emi.yearlySchedule.length > 0 && emi.yearlySchedule.length <= 30);

  // #34 ROI, Profit Margin & Break-Even
  const roi = calculateRoiMarginBreakEven(40, 100, 500, 12000);
  assert.equal(roi.unitContributionMargin, 60);
  assert.equal(roi.grossMarginPercent, 60);
  assert.equal(roi.markupPercent, 150);
  assert.equal(roi.breakEvenUnits, 200);
  assert.equal(roi.netProfit, 18000);

  // #35 Ohm's Law & Electrical Power
  const ohm = calculateOhmsLawAndPower('from-v-i', 24, 2, 100, 100);
  assert.equal(ohm.resistanceOhm, 12);
  assert.equal(ohm.powerW, 48);
  assert.equal(ohm.seriesReq, 200);
  assert.equal(ohm.parallelReq, 50);

  // #36 Descriptive Statistics & Standard Deviation
  const stats = calculateDescriptiveStatistics('10, 20, 20, 30, 40');
  assert.equal(stats.count, 5);
  assert.equal(stats.mean, 24);
  assert.equal(stats.median, 20);
  assert.deepEqual(stats.modes, [20]);
  assert.equal(stats.range, 30);
  assert.ok(stats.sampleStdDev > 11.4 && stats.sampleStdDev < 11.41);

  // #37 Typography, Rem/Px & DPI Print Converter
  const typo = convertTypographyAndCssUnits(24, 'px', 16, 96);
  assert.equal(typo.rem, 1.5);
  assert.equal(typo.pt, 18);

  // #38 Data Transfer Time & Bandwidth Calculator
  const bw = calculateBandwidthTransferTime(10, 'GB', 1, 'Gbps', 0);
  assert.equal(bw.totalSeconds, 80);
  assert.equal(bw.formattedDuration, '1m 20s');
});

