/*******************************************************************************

    They Live Ad Classifier — Unit Tests
    Run with: node --test docs/tests/they-live-classify.js

    Tests the pure classification logic in they-live-classify.js without any
    browser API dependencies. Uses the built-in Node.js test runner (≥v22).

*******************************************************************************/

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    THEY_LIVE_PHRASES,
    DOMAIN_RULES,
    KEYWORD_RULES,
    cacheKey,
    localClassify,
} from '../../uBlock/platform/mv3/extension/js/they-live-classify.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a synthetic context string the same way they-live.js does it.
const ctx = ({ page = '', sel = '', link = '', text = '' } = {}) => {
    const parts = [];
    if ( page ) { parts.push(`[page:${page}]`); }
    if ( sel )  { parts.push(`[sel:${sel}]`); }
    if ( link ) { parts.push(`[link:${link}]`); }
    if ( text ) { parts.push(text); }
    return parts.join(' ');
};

// ---------------------------------------------------------------------------
// 1. Phrase list integrity
// ---------------------------------------------------------------------------

describe('THEY_LIVE_PHRASES', () => {
    test('contains exactly 18 phrases', () => {
        assert.equal(THEY_LIVE_PHRASES.length, 18);
    });

    test('contains all canonical They Live (1988) phrases', () => {
        const required = [
            'OBEY', 'CONSUME', 'WATCH TV', 'SLEEP', 'NO INDEPENDENT THOUGHT',
            'SUBMIT', 'CONFORM', 'STAY ASLEEP', 'BUY', 'WORK',
            'DO NOT QUESTION AUTHORITY', 'NO IMAGINATION', 'MARRY AND REPRODUCE',
            'THIS IS YOUR GOD', 'HONOR APATHY', 'NO IDEAS', 'WORK 8 HOURS', 'PLAY 8 HOURS',
        ];
        for ( const phrase of required ) {
            assert.ok(THEY_LIVE_PHRASES.includes(phrase), `Missing phrase: ${phrase}`);
        }
    });

    test('all DOMAIN_RULES phrases are valid labels', () => {
        for ( const [, phrase] of DOMAIN_RULES ) {
            assert.ok(
                THEY_LIVE_PHRASES.includes(phrase),
                `DOMAIN_RULES maps to unknown phrase: "${phrase}"`
            );
        }
    });

    test('all KEYWORD_RULES phrases are valid labels', () => {
        for ( const [, phrase] of KEYWORD_RULES ) {
            assert.ok(
                THEY_LIVE_PHRASES.includes(phrase),
                `KEYWORD_RULES maps to unknown phrase: "${phrase}"`
            );
        }
    });
});

// ---------------------------------------------------------------------------
// 2. cacheKey
// ---------------------------------------------------------------------------

describe('cacheKey', () => {
    test('returns a string', () => {
        assert.equal(typeof cacheKey('hello'), 'string');
    });

    test('is deterministic', () => {
        assert.equal(cacheKey('same'), cacheKey('same'));
    });

    test('different inputs produce different keys', () => {
        assert.notEqual(cacheKey('abc'), cacheKey('xyz'));
    });

    test('empty string does not throw', () => {
        assert.doesNotThrow(() => cacheKey(''));
    });
});

// ---------------------------------------------------------------------------
// 3. localClassify — domain rules (link destination)
// ---------------------------------------------------------------------------

describe('localClassify — domain rules via link', () => {
    // Streaming
    test('netflix link → WATCH TV', () => {
        assert.equal(localClassify(ctx({ link: 'netflix.com' })), 'WATCH TV');
    });
    test('youtube link → WATCH TV', () => {
        assert.equal(localClassify(ctx({ link: 'youtube.com' })), 'WATCH TV');
    });
    test('spotify link → WATCH TV', () => {
        assert.equal(localClassify(ctx({ link: 'spotify.com' })), 'WATCH TV');
    });
    test('disney+ link → WATCH TV', () => {
        assert.equal(localClassify(ctx({ link: 'disneyplus.com' })), 'WATCH TV');
    });

    // Retail
    test('amazon link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'amazon.com' })), 'CONSUME');
    });
    test('ebay link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'ebay.com' })), 'CONSUME');
    });

    // Finance
    test('chase link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'chase.com' })), 'THIS IS YOUR GOD');
    });
    test('coinbase link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'coinbase.com' })), 'THIS IS YOUR GOD');
    });

    // News
    test('cnn link → NO INDEPENDENT THOUGHT', () => {
        assert.equal(localClassify(ctx({ link: 'cnn.com' })), 'NO INDEPENDENT THOUGHT');
    });

    // Social
    test('instagram link → HONOR APATHY', () => {
        assert.equal(localClassify(ctx({ link: 'instagram.com' })), 'HONOR APATHY');
    });

    // Gaming
    test('steampowered link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'steampowered.com' })), 'PLAY 8 HOURS');
    });
    test('nintendo link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'nintendo.com' })), 'PLAY 8 HOURS');
    });

    // Dating
    test('tinder link → MARRY AND REPRODUCE', () => {
        assert.equal(localClassify(ctx({ link: 'tinder.com' })), 'MARRY AND REPRODUCE');
    });

    // Jobs
    test('linkedin link → WORK 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'linkedin.com' })), 'WORK 8 HOURS');
    });
    test('indeed link → WORK 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'indeed.com' })), 'WORK 8 HOURS');
    });
});

// ---------------------------------------------------------------------------
// 4. localClassify — keyword rules via selector
// ---------------------------------------------------------------------------

describe('localClassify — keyword rules via selector', () => {
    test('gaming selector → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ sel: '.gaming-promo' })), 'PLAY 8 HOURS');
    });
    test('finance selector → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ sel: '[data-type="finance-ad"]' })), 'THIS IS YOUR GOD');
    });
    test('job selector → WORK 8 HOURS', () => {
        assert.equal(localClassify(ctx({ sel: '.career-ad' })), 'WORK 8 HOURS');
    });
    test('sponsor selector → OBEY', () => {
        assert.equal(localClassify(ctx({ sel: '[data-sponsored="true"]' })), 'OBEY');
    });
    test('dating selector → MARRY AND REPRODUCE', () => {
        assert.equal(localClassify(ctx({ sel: '.dating-banner' })), 'MARRY AND REPRODUCE');
    });
});

// ---------------------------------------------------------------------------
// 5. localClassify — keyword rules via full-context scan
// ---------------------------------------------------------------------------

describe('localClassify — keyword rules via text scan', () => {
    test('crypto text → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ text: 'Buy crypto now on our platform' })), 'THIS IS YOUR GOD');
    });
    test('job posting text → WORK 8 HOURS', () => {
        assert.equal(localClassify(ctx({ text: 'We are hiring talented engineers' })), 'WORK 8 HOURS');
    });
    test('news text → NO INDEPENDENT THOUGHT', () => {
        assert.equal(localClassify(ctx({ text: 'Breaking news: stock market falls' })), 'NO INDEPENDENT THOUGHT');
    });
    test('social text → HONOR APATHY', () => {
        assert.equal(localClassify(ctx({ text: 'Follow us on social media' })), 'HONOR APATHY');
    });
    test('baby/pregnancy text → MARRY AND REPRODUCE', () => {
        assert.equal(localClassify(ctx({ text: 'New baby formula available now' })), 'MARRY AND REPRODUCE');
    });
    test('SaaS text → NO IDEAS', () => {
        assert.equal(localClassify(ctx({ text: 'The best SaaS platform for teams' })), 'NO IDEAS');
    });
    test('shopping text → BUY', () => {
        assert.equal(localClassify(ctx({ text: 'Add to cart and purchase today' })), 'BUY');
    });
});

// ---------------------------------------------------------------------------
// 6. localClassify — page domain fallback (weakest signal)
// ---------------------------------------------------------------------------

describe('localClassify — page domain fallback', () => {
    test('netflix page → WATCH TV (fallback)', () => {
        assert.equal(localClassify(ctx({ page: 'netflix.com' })), 'WATCH TV');
    });
    test('amazon page → CONSUME (fallback)', () => {
        assert.equal(localClassify(ctx({ page: 'amazon.com' })), 'CONSUME');
    });
});

// ---------------------------------------------------------------------------
// 7. Priority ordering: link > selector > text > page
// ---------------------------------------------------------------------------

describe('localClassify — priority ordering', () => {
    test('link domain beats selector keyword', () => {
        // Link says gaming (PLAY 8 HOURS) but selector says finance — link wins
        const result = localClassify(ctx({
            link: 'steampowered.com',
            sel: '[data-type="finance"]',
        }));
        assert.equal(result, 'PLAY 8 HOURS');
    });

    test('link domain beats page domain', () => {
        // Link says amazon (CONSUME), page says netflix (WATCH TV) — link wins
        const result = localClassify(ctx({
            link: 'amazon.com',
            page: 'netflix.com',
        }));
        assert.equal(result, 'CONSUME');
    });

    test('selector keyword beats page domain', () => {
        // No link, selector says gaming, page says finance domain
        const result = localClassify(ctx({
            sel: '.gaming-ad',
            page: 'chase.com',
        }));
        assert.equal(result, 'PLAY 8 HOURS');
    });
});

// ---------------------------------------------------------------------------
// 8. CRITICAL REGRESSION: video format must NOT produce WATCH TV
// ---------------------------------------------------------------------------

describe('video format regression (WATCH TV bug)', () => {
    test('selector ".video-ad" does NOT produce WATCH TV', () => {
        const result = localClassify(ctx({ sel: '.video-ad' }));
        assert.notEqual(result, 'WATCH TV', '.video-ad is a format, not streaming content');
    });

    test('selector "[data-format=video]" does NOT produce WATCH TV', () => {
        const result = localClassify(ctx({ sel: '[data-format="video"]' }));
        assert.notEqual(result, 'WATCH TV');
    });

    test('selector ".video-player-ad" does NOT produce WATCH TV', () => {
        const result = localClassify(ctx({ sel: '.video-player-ad' }));
        assert.notEqual(result, 'WATCH TV');
    });

    test('selector "stream" alone does NOT produce WATCH TV (no streaming domain)', () => {
        const result = localClassify(ctx({ sel: '.stream-ad' }));
        assert.notEqual(result, 'WATCH TV');
    });

    test('context with "video" text and NO streaming link does NOT produce WATCH TV', () => {
        // A video-format ad for car insurance should NOT be WATCH TV
        const result = localClassify(ctx({
            sel: '.video-ad',
            text: 'Short video ad from Geico',
            page: 'example.com',
        }));
        // Geico is in DOMAIN_RULES via page domain → WORK; not WATCH TV
        assert.notEqual(result, 'WATCH TV');
    });

    test('netflix link in video ad container IS still WATCH TV (correct streaming via link)', () => {
        const result = localClassify(ctx({
            link: 'netflix.com',
            sel: '.video-ad',
        }));
        assert.equal(result, 'WATCH TV');
    });
});

// ---------------------------------------------------------------------------
// 9. Unknown context → null (send to LLM)
// ---------------------------------------------------------------------------

describe('localClassify — null for unknown context', () => {
    test('empty context → null', () => {
        assert.equal(localClassify(''), null);
    });

    test('unrecognised domain and no keywords → null', () => {
        assert.equal(localClassify(ctx({ page: 'random-site.example', link: 'other.example' })), null);
    });

    test('irrelevant text → null', () => {
        assert.equal(localClassify(ctx({ text: 'Generic promotional message xyz123' })), null);
    });
});

// ---------------------------------------------------------------------------
// 10. Insurance bug fix: insurance companies → THIS IS YOUR GOD (not WORK)
// ---------------------------------------------------------------------------

describe('insurance domain rules — THIS IS YOUR GOD', () => {
    test('progressive link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'progressive.com' })), 'THIS IS YOUR GOD');
    });
    test('geico link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'geico.com' })), 'THIS IS YOUR GOD');
    });
    test('allstate link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'allstate.com' })), 'THIS IS YOUR GOD');
    });
    test('statefarm link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'statefarm.com' })), 'THIS IS YOUR GOD');
    });
    test('comparethemarket link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'comparethemarket.com' })), 'THIS IS YOUR GOD');
    });
    test('moneysupermarket link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'moneysupermarket.com' })), 'THIS IS YOUR GOD');
    });
});

// ---------------------------------------------------------------------------
// 11. Real estate / mortgage domain rules → THIS IS YOUR GOD
// ---------------------------------------------------------------------------

describe('real estate & mortgage domain rules', () => {
    test('rightmove link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'rightmove.co.uk' })), 'THIS IS YOUR GOD');
    });
    test('zoopla link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'zoopla.co.uk' })), 'THIS IS YOUR GOD');
    });
    test('zillow link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'zillow.com' })), 'THIS IS YOUR GOD');
    });
    test('habito link → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ link: 'habito.com' })), 'THIS IS YOUR GOD');
    });
    test('"mortgage" keyword text → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ text: 'Best mortgage rates 2024' })), 'THIS IS YOUR GOD');
    });
    test('"real estate" keyword text → THIS IS YOUR GOD', () => {
        assert.equal(localClassify(ctx({ text: 'UK real estate investment' })), 'THIS IS YOUR GOD');
    });
});

// ---------------------------------------------------------------------------
// 12. Travel domain rules → CONSUME
// ---------------------------------------------------------------------------

describe('travel domain rules', () => {
    test('booking link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'booking.com' })), 'CONSUME');
    });
    test('expedia link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'expedia.com' })), 'CONSUME');
    });
    test('airbnb link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'airbnb.com' })), 'CONSUME');
    });
    test('skyscanner link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'skyscanner.net' })), 'CONSUME');
    });
    test('easyjet link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'easyjet.com' })), 'CONSUME');
    });
    test('tripadvisor link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'tripadvisor.com' })), 'CONSUME');
    });
});

// ---------------------------------------------------------------------------
// 13. Food delivery domain rules → CONSUME
// ---------------------------------------------------------------------------

describe('food delivery domain rules', () => {
    test('deliveroo link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'deliveroo.co.uk' })), 'CONSUME');
    });
    test('ubereats link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'ubereats.com' })), 'CONSUME');
    });
    test('doordash link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'doordash.com' })), 'CONSUME');
    });
    test('hellofresh link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'hellofresh.co.uk' })), 'CONSUME');
    });
    test('justeat link → CONSUME', () => {
        assert.equal(localClassify(ctx({ link: 'justeat.co.uk' })), 'CONSUME');
    });
});

// ---------------------------------------------------------------------------
// 14. Sleep / therapy domain & keyword rules → SLEEP
// ---------------------------------------------------------------------------

describe('sleep & therapy rules', () => {
    test('betterhelp link → SLEEP', () => {
        assert.equal(localClassify(ctx({ link: 'betterhelp.com' })), 'SLEEP');
    });
    test('calm link → SLEEP', () => {
        assert.equal(localClassify(ctx({ link: 'calm.com' })), 'SLEEP');
    });
    test('headspace link → SLEEP', () => {
        assert.equal(localClassify(ctx({ link: 'headspace.com' })), 'SLEEP');
    });
    test('talkspace link → SLEEP', () => {
        assert.equal(localClassify(ctx({ link: 'talkspace.com' })), 'SLEEP');
    });
    test('"therapy" keyword → SLEEP', () => {
        assert.equal(localClassify(ctx({ text: 'Talk to a therapist online today' })), 'SLEEP');
    });
    test('"mental health" keyword → SLEEP', () => {
        assert.equal(localClassify(ctx({ text: 'Mental health support anytime' })), 'SLEEP');
    });
    test('"meditation" keyword → SLEEP', () => {
        assert.equal(localClassify(ctx({ text: 'Start meditating in 5 minutes' })), 'SLEEP');
    });
    test('"counselling" keyword → SLEEP', () => {
        assert.equal(localClassify(ctx({ text: 'Free online counselling sessions' })), 'SLEEP');
    });
});

// ---------------------------------------------------------------------------
// 15. Health/wellness keyword rules → CONFORM
// ---------------------------------------------------------------------------

describe('health & wellness keyword rules', () => {
    test('"supplement" keyword → CONFORM', () => {
        assert.equal(localClassify(ctx({ text: 'Daily vitamin supplement for energy' })), 'CONFORM');
    });
    test('"vitamin" keyword → CONFORM', () => {
        assert.equal(localClassify(ctx({ text: 'Vitamin D3 1000IU high strength' })), 'CONFORM');
    });
    test('"weight loss" keyword → CONFORM', () => {
        assert.equal(localClassify(ctx({ text: 'Doctor-backed weight loss programme' })), 'CONFORM');
    });
    test('noom link → CONFORM', () => {
        assert.equal(localClassify(ctx({ link: 'noom.com' })), 'CONFORM');
    });
    test('hollandandbarrett link → CONFORM', () => {
        assert.equal(localClassify(ctx({ link: 'hollandandbarrett.com' })), 'CONFORM');
    });
});

// ---------------------------------------------------------------------------
// 16. Mobile game studio domain rules → PLAY 8 HOURS
// ---------------------------------------------------------------------------

describe('mobile game studio domain rules', () => {
    test('supercell (Clash of Clans) link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'supercell.com' })), 'PLAY 8 HOURS');
    });
    test('plarium (RAID) link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'plarium.com' })), 'PLAY 8 HOURS');
    });
    test('scopely (Monopoly Go) link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'scopely.com' })), 'PLAY 8 HOURS');
    });
    test('zynga link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'zynga.com' })), 'PLAY 8 HOURS');
    });
    test('niantic (Pokemon Go) link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'nianticlabs.com' })), 'PLAY 8 HOURS');
    });
    test('activision link → PLAY 8 HOURS', () => {
        assert.equal(localClassify(ctx({ link: 'activision.com' })), 'PLAY 8 HOURS');
    });
});
