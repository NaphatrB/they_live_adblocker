#!/usr/bin/env node
/**
 * Live test for PROFILE_ANALYSIS_SYSTEM_PROMPT.
 *
 * Usage:
 *   OLLAMA_KEY=<your-key> node docs/tests/they-live-profile-analysis.js
 *   OLLAMA_KEY=<your-key> OLLAMA_MODEL=gemma3:4b node docs/tests/they-live-profile-analysis.js
 *
 * Sends three synthetic profiles to the LLM and evaluates whether the
 * responses are substantive, correctly scoped, and appropriately toned.
 */

const BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
const MODEL    = process.env.OLLAMA_MODEL    || 'gemma4:31b-cloud';
const API_KEY  = process.env.OLLAMA_KEY      || '';

if ( !API_KEY ) {
    console.error('ERROR: Set OLLAMA_KEY env var to run this test.');
    process.exit(1);
}

// --- Prompt (must stay in sync with background.js PROFILE_ANALYSIS_SYSTEM_PROMPT) ---
const PROFILE_ANALYSIS_SYSTEM_PROMPT = [
    'You are an expert in programmatic advertising, real-time bidding, and data broker audience profiles.',
    'A browser extension has collected ad targeting data from a real browsing session.',
    'Analyse the data and explain — specifically and bluntly — what the advertising industry believes about this person.',
    'Write 4-6 punchy bullet points. Focus on what the data *implies* (income bracket, life stage, purchase intent, segment value) rather than just restating numbers.',
    'Adopt a slightly sardonic tone, as if explaining the matrix to someone who just put on the glasses from the film "They Live".',
    'Keep your total response under 220 words. Use plain bullet points (• ), no headers.',
].join('\n');

// Phrase → broker trait labels (kept in sync with background.js PHRASE_TRAITS)
const PHRASE_TRAITS = {
    'CONSUME':                   'Online shopper / retail interest',
    'BUY':                       'In-market buyer (active purchase intent)',
    'WORK':                      'Career / B2B / professional services',
    'WORK 8 HOURS':              'Job-seeker / recruitment target',
    'THIS IS YOUR GOD':          'Homeowner · financially active · insured',
    'NO INDEPENDENT THOUGHT':    'News & current affairs reader',
    'WATCH TV':                  'Streaming / entertainment consumer',
    'PLAY 8 HOURS':              'Gamer',
    'SLEEP':                     'Wellness / mental health interest',
    'CONFORM':                   'Beauty & lifestyle consumer',
    'OBEY':                      'General audience (low targeting precision)',
    'SUBMIT':                    'Email / newsletter marketing target',
    'HONOR APATHY':              'Social media & influencer marketing target',
    'NO IDEAS':                  'SaaS / business software prospect',
    'NO IMAGINATION':            'Creative software / design tools prospect',
    'MARRY AND REPRODUCE':       'Dating / family / relationship interest',
    'DO NOT QUESTION AUTHORITY': 'Government / legal / civic content target',
    'STAY ASLEEP':               'Passive / ambient media consumer',
};

// --- Synthetic test profiles ---
const PROFILES = [
    {
        name: 'High-value professional',
        phraseFreq: { 'THIS IS YOUR GOD': 8, 'CONSUME': 6, 'WORK': 4, 'BUY': 3, 'NO INDEPENDENT THOUGHT': 2 },
        retargeters: [
            { domain: 'progressive.com', count: 7, pageCount: 4 },
            { domain: 'amazon.com', count: 12, pageCount: 8 },
            { domain: 'linkedin.com', count: 3, pageCount: 2 },
        ],
        customParams: [
            { page: 'wired.com', params: 'age=35-44&hhi=75000-100000&interests=technology,finance' },
        ],
        expect: ['homeowner', 'income', 'amazon', 'retarget'],
    },
    {
        name: 'Gamer / student profile',
        phraseFreq: { 'PLAY 8 HOURS': 10, 'CONSUME': 5, 'HONOR APATHY': 4, 'WATCH TV': 3 },
        retargeters: [
            { domain: 'steampowered.com', count: 5, pageCount: 3 },
            { domain: 'epicgames.com', count: 4, pageCount: 2 },
        ],
        customParams: [],
        // LLM may say "Gen Z / Digital Native / microtransaction" rather than "young / student"
        expect: ['gam', 'steam', 'digital', 'spend', 'gen'],
    },
    {
        name: 'Job-seeker / recent graduate',
        phraseFreq: { 'WORK 8 HOURS': 9, 'SLEEP': 4, 'CONSUME': 3, 'OBEY': 2 },
        retargeters: [
            { domain: 'indeed.com', count: 6, pageCount: 4 },
            { domain: 'glassdoor.com', count: 4, pageCount: 3 },
        ],
        customParams: [],
        expect: ['job', 'career', 'indeed', 'work'],
    },
];

async function callLlm(interests, retargeters, customParams) {
    const total = Object.values(interests).reduce((n, c) => n + c, 0);
    const interestLines = Object.entries(interests)
        .filter(([p]) => PHRASE_TRAITS[p])
        .map(([p, count]) => `- ${PHRASE_TRAITS[p]}: ${count} ads (${Math.round(count / total * 100)}%)`)
        .join('\n');

    const retargetLines = retargeters.length > 0
        ? retargeters.map(r => `- ${r.domain}: seen ${r.count}× across ${r.pageCount} site(s)`).join('\n')
        : '- None detected this session';

    const dcLines = customParams.length > 0
        ? customParams.map(c => `- [${c.page}] ${c.params}`).join('\n')
        : '';

    const userContent = [
        'AD CATEGORIES SEEN (by frequency):',
        interestLines,
        '',
        'RETARGETING TRACKERS (advertisers following across multiple sites):',
        retargetLines,
        ...(dcLines ? ['', 'RAW TARGETING DATA (decoded from Google/DoubleClick):', dcLines] : []),
        '',
        'What does this targeting data reveal about how the advertising industry has profiled this user?',
    ].join('\n');

    const headers = { 'Content-Type': 'application/json' };
    if ( API_KEY ) { headers['Authorization'] = `Bearer ${API_KEY}`; }

    const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: PROFILE_ANALYSIS_SYSTEM_PROMPT },
                { role: 'user',   content: userContent },
            ],
            stream: false,
        }),
        signal: AbortSignal.timeout(45000),
    });

    if ( !resp.ok ) { throw new Error(`HTTP ${resp.status}`); }
    const data = await resp.json();
    let text = data.choices?.[0]?.message?.content || '';
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function evalResponse(name, response, expects) {
    const lower = response.toLowerCase();
    const hits = expects.filter(kw => lower.includes(kw));
    const pass = hits.length >= Math.ceil(expects.length * 0.5); // ≥50% keywords present
    const bulletCount = (response.match(/^[•\-\*]/gm) || []).length;
    const wordCount = response.split(/\s+/).length;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`PROFILE: ${name}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(response);
    console.log(`\n  Bullets: ${bulletCount}  Words: ${wordCount}  Keywords hit: ${hits.join(', ') || 'none'}`);
    console.log(`  Result: ${pass ? '✅ PASS' : '❌ FAIL'}`);
    return pass;
}

(async () => {
    console.log(`Model: ${MODEL}  Endpoint: ${BASE_URL}\n`);
    let passed = 0;
    for ( let i = 0; i < PROFILES.length; i++ ) {
        const p = PROFILES[i];
        if ( i > 0 ) { await new Promise(r => setTimeout(r, 3000)); } // brief pause between calls
        try {
            const response = await callLlm(p.phraseFreq, p.retargeters, p.customParams);
            if ( evalResponse(p.name, response, p.expect) ) { passed++; }
        } catch(e) {
            console.error(`\nERROR for "${p.name}": ${e.message}`);
        }
    }
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TOTAL: ${passed}/${PROFILES.length} profiles produced acceptable responses`);
    process.exit(passed === PROFILES.length ? 0 : 1);
})();
