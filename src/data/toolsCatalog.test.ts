import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_CATEGORIES,
  IMAGE_CATEGORIES,
  EXTRA_CATEGORIES,
  PDF_TOOLS,
  IMAGE_TOOLS,
  EXTRA_TOOLS,
  ALL_312_FILTER_PRESETS,
  ENCRYPTION_104_PROFILES,
  searchStudioTools,
} from './toolsCatalog';

test('PDF Studio contains all 7 categories and exactly 60 tools numbered 1 to 60', () => {
  assert.equal(PDF_CATEGORIES.length, 7);
  assert.equal(PDF_TOOLS.length, 60);
  for (let i = 0; i < 60; i++) {
    assert.equal(PDF_TOOLS[i].number, i + 1);
    assert.equal(PDF_TOOLS[i].studio, 'pdf');
    assert.ok(PDF_TOOLS[i].name.length > 0);
  }
});

test('Image Studio contains all 6 categories and 49 tool groups numbered 1 to 49', () => {
  assert.equal(IMAGE_CATEGORIES.length, 6);
  assert.equal(IMAGE_TOOLS.length, 49);
  for (let i = 0; i < 49; i++) {
    assert.equal(IMAGE_TOOLS[i].number, i + 1);
    assert.equal(IMAGE_TOOLS[i].studio, 'image');
    assert.ok(IMAGE_TOOLS[i].name.length > 0);
  }
});

test('Extra Tools contains 5 categories and 32 tools numbered 1 to 32 with strict exclusions', () => {
  assert.equal(EXTRA_CATEGORIES.length, 5);
  assert.equal(EXTRA_TOOLS.length, 32);
  for (let i = 0; i < 32; i++) {
    assert.equal(EXTRA_TOOLS[i].number, i + 1);
    assert.equal(EXTRA_TOOLS[i].studio, 'extra');
    assert.ok(EXTRA_TOOLS[i].name.length > 0);
    const lowerName = EXTRA_TOOLS[i].name.toLowerCase();
    assert.ok(!lowerName.includes('name day'), 'Must not include Name Days');
    assert.ok(!lowerName.includes('countdown'), 'Must not include Event Countdown Timers');
    assert.ok(!lowerName.includes('stopwatch'), 'Must not include Stopwatch');
  }
});

test('Filter presets exceed 310+ requirement and encryption profiles exceed 100+ requirement', () => {
  assert.ok(ALL_312_FILTER_PRESETS.length >= 310);
  assert.ok(ENCRYPTION_104_PROFILES.length >= 100);
});

test('searchStudioTools filters accurately across PDF, Image, and Extra Tools (141 total tools)', () => {
  const batesResults = searchStudioTools('Bates', 'pdf');
  assert.equal(batesResults.length, 1);
  assert.equal(batesResults[0].number, 43);

  const kuwaharaResults = searchStudioTools('Kuwahara', 'image');
  assert.equal(kuwaharaResults.length, 1);
  assert.equal(kuwaharaResults[0].number, 47);

  const graphingResults = searchStudioTools('2D Graphing Calculator', 'extra');
  assert.equal(graphingResults.length, 1);
  assert.equal(graphingResults[0].number, 9);

  const allTools = searchStudioTools('');
  assert.equal(allTools.length, 141);
});

test('userStorage strictly isolates preferences and workspace snapshots per user.uid', async () => {
  const {
    saveUserPreferences,
    loadUserPreferences,
    saveUserWorkspaceSnapshot,
    loadUserWorkspaceSnapshot,
  } = await import('../utils/userStorage');

  saveUserPreferences('uid-alice', {
    pinnedToolIds: ['pdf-1-merge', 'img-1-single-resize'],
    customPipelinePresets: [
      {
        id: 'p1',
        name: 'Alice Preset',
        createdAt: '10:00:00',
        steps: [{ uid: 's1', tool: PDF_TOOLS[0], params: {} }],
      },
    ],
    savedToolParamPresets: { 'pdf-6-rotate': { angle: 180 } },
    calcHistoryByToolId: {},
  });

  saveUserPreferences('uid-bob', {
    pinnedToolIds: ['extra-5-currency-converter'],
    customPipelinePresets: [],
    savedToolParamPresets: {},
    calcHistoryByToolId: {},
  });

  const alicePrefs = loadUserPreferences('uid-alice');
  const bobPrefs = loadUserPreferences('uid-bob');
  const charliePrefs = loadUserPreferences('uid-charlie-fresh');

  assert.deepEqual(alicePrefs.pinnedToolIds, ['pdf-1-merge', 'img-1-single-resize']);
  assert.equal(alicePrefs.customPipelinePresets.length, 1);
  assert.deepEqual(bobPrefs.pinnedToolIds, ['extra-5-currency-converter']);
  assert.equal(bobPrefs.customPipelinePresets.length, 0);
  assert.deepEqual(charliePrefs.pinnedToolIds, []);

  await saveUserWorkspaceSnapshot('uid-alice', {
    filesByToolId: {},
    selectedIdsByToolId: {},
    activeFileIdByToolId: {},
    resultByToolId: {},
    stampImages: [],
    selectedStampImageId: '',
    importedHistory: [
      {
        id: 'imp-1',
        name: 'alice-contract.pdf',
        kind: 'pdf',
        sizeBytes: 1024,
        uploadedAt: '10:00:00',
        bytes: new Uint8Array([1, 2, 3]),
        sourceToolId: 'pdf-1-merge',
        sourceToolName: 'PDF #1 Merge',
      },
    ],
    completedOutputs: [],
    auditLogs: [],
    pipelineFiles: [],
    pipelineSummary: 'Alice summary',
    pipelineLastResult: null,
  });

  const aliceSnap = await loadUserWorkspaceSnapshot('uid-alice');
  const bobSnap = await loadUserWorkspaceSnapshot('uid-bob');

  assert.equal(aliceSnap.importedHistory.length, 1);
  assert.equal(aliceSnap.importedHistory[0].name, 'alice-contract.pdf');
  assert.equal(bobSnap.importedHistory.length, 0);
});

test('MULTI_FILE_TOOL_IDS contains strictly the 10 canonical multi-file tools', async () => {
  const { MULTI_FILE_TOOL_IDS, isMultiFileToolId } = await import('./toolsCatalog');
  const expected = [
    'pdf-1-merge',
    'pdf-26-image-to-pdf',
    'pdf-52-compare',
    'pdf-54-overlay',
    'img-2-batch-resize',
    'img-4-batch-crop',
    'img-33-collage',
    'img-34-stitching',
    'img-35-stacking',
    'img-42-compare-slider',
  ];
  assert.deepEqual(Array.from(MULTI_FILE_TOOL_IDS), expected);
  assert.equal(isMultiFileToolId('pdf-10-add-folders'), false);
  assert.equal(isMultiFileToolId('pdf-23-word-to-pdf'), false);
});
