-- ============================================================
-- Reddit AI Debate Analyzer — Database Schema
-- PostgreSQL 14+   |   All PKs: SERIAL (numeric)
-- ============================================================

-- 1. users
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    google_id     VARCHAR(255) UNIQUE,
    auth_provider VARCHAR(20)  DEFAULT 'local' CHECK (auth_provider IN ('local', 'google')),
    avatar        VARCHAR(255) DEFAULT '👤',
    karma         INTEGER      DEFAULT 0,
    joined_date   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email    ON users(email);

-- 2. subreddits
CREATE TABLE subreddits (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL UNIQUE,
    icon         VARCHAR(50)  DEFAULT '📁',
    member_count INTEGER      DEFAULT 0,
    color        VARCHAR(50)  DEFAULT 'bg-blue-500',
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subreddits_name ON subreddits(name);

-- 3. user_subreddit_memberships (join table)
CREATE TABLE user_subreddit_memberships (
    user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    subreddit_id INTEGER NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
    joined_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, subreddit_id)
);

-- 4. posts
CREATE TABLE posts (
    id            SERIAL PRIMARY KEY,
    title         VARCHAR(300) NOT NULL,
    content       TEXT         NOT NULL,
    author_id     INTEGER      NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    subreddit_id  INTEGER      NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
    upvotes       INTEGER      DEFAULT 0,
    downvotes     INTEGER      DEFAULT 0,
    comment_count INTEGER      DEFAULT 0,
    image         TEXT,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_subreddit ON posts(subreddit_id);
CREATE INDEX idx_posts_author    ON posts(author_id);
CREATE INDEX idx_posts_created   ON posts(created_at DESC);

-- 5. comments
CREATE TABLE comments (
    id                SERIAL PRIMARY KEY,
    post_id           INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id INTEGER          REFERENCES comments(id) ON DELETE CASCADE,
    text              TEXT    NOT NULL,
    upvotes           INTEGER DEFAULT 0,
    downvotes         INTEGER DEFAULT 0,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_post   ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);

-- 6. votes
CREATE TABLE votes (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type  VARCHAR(10) NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id    INTEGER     NOT NULL,
    vote_type    VARCHAR(4)  NOT NULL CHECK (vote_type IN ('up', 'down')),
    created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX idx_votes_target ON votes(target_type, target_id);
CREATE INDEX idx_votes_user   ON votes(user_id);

-- 7. reports
CREATE TABLE reports (
    id               SERIAL PRIMARY KEY,
    reporter_user_id INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    comment_id       INTEGER     NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reason           TEXT        NOT NULL,
    status           VARCHAR(20) DEFAULT 'pending'
                                 CHECK (status IN ('pending','reviewed','dismissed','actioned')),
    created_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    reviewed_at      TIMESTAMP,
    reviewed_by      INTEGER     REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_comment ON reports(comment_id);
CREATE INDEX idx_reports_status  ON reports(status);

-- 8. reasoning_summaries (US1)
CREATE TABLE reasoning_summaries (
    id              SERIAL PRIMARY KEY,
    comment_id      INTEGER       NOT NULL UNIQUE REFERENCES comments(id) ON DELETE CASCADE,
    summary         TEXT          NOT NULL,
    primary_claim   TEXT          NOT NULL,
    evidence_blocks JSONB         NOT NULL,
    coherence_score NUMERIC(3,2)  CHECK (coherence_score >= 0 AND coherence_score <= 1),
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP     DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX idx_reasoning_comment ON reasoning_summaries(comment_id);
CREATE INDEX idx_reasoning_expires ON reasoning_summaries(expires_at);

-- 9. drafts (US3)
CREATE TABLE drafts (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id          INTEGER              REFERENCES posts(id) ON DELETE SET NULL,
    text             TEXT        NOT NULL,
    last_feedback    JSONB,
    last_analyzed_at TIMESTAMP,
    created_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMP   DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE INDEX idx_drafts_user    ON drafts(user_id);
CREATE INDEX idx_drafts_expires ON drafts(expires_at);

-- 10. feedback_logs (US3)
CREATE TABLE feedback_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    draft_id    INTEGER               REFERENCES drafts(id) ON DELETE SET NULL,
    draft_text  TEXT         NOT NULL,
    issues      JSONB        NOT NULL,
    score       NUMERIC(3,2) CHECK (score >= 0 AND score <= 1),
    suggestions JSONB,
    confidence  NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_user    ON feedback_logs(user_id);
CREATE INDEX idx_feedback_draft   ON feedback_logs(draft_id);
CREATE INDEX idx_feedback_created ON feedback_logs(created_at DESC);

-- 11. emoji_reactions (for emoji reactions feature)
CREATE TABLE emoji_reactions (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type  VARCHAR(20)  NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id    INTEGER      NOT NULL,
    emoji        VARCHAR(10)  NOT NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_type, target_id, emoji)
);

CREATE INDEX idx_reactions_target   ON emoji_reactions(target_type, target_id);
CREATE INDEX idx_reactions_user     ON emoji_reactions(user_id);
CREATE INDEX idx_reactions_emoji    ON emoji_reactions(emoji);

-- 12. debate_sides (for tracking debate position: for/against/neutral)
CREATE TABLE debate_sides (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id      INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    side         VARCHAR(20)  NOT NULL CHECK (side IN ('for', 'against', 'neutral')),
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id)
);

CREATE INDEX idx_debate_sides_user  ON debate_sides(user_id);
CREATE INDEX idx_debate_sides_post  ON debate_sides(post_id);
CREATE INDEX idx_debate_sides_side  ON debate_sides(side);

-- 13. polls (for poll posts)
CREATE TABLE polls (
    id           SERIAL PRIMARY KEY,
    post_id      INTEGER      NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
    question     TEXT         NOT NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    ends_at      TIMESTAMP    DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX idx_polls_post  ON polls(post_id);
CREATE INDEX idx_polls_ends  ON polls(ends_at);

-- 14. poll_options (answer options for a poll)
CREATE TABLE poll_options (
    id       SERIAL PRIMARY KEY,
    poll_id  INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text     TEXT    NOT NULL,
    position INTEGER NOT NULL
);

CREATE INDEX idx_poll_options_poll ON poll_options(poll_id);

-- 15. poll_votes (user votes on poll options)
CREATE TABLE poll_votes (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id    INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, option_id)
);

CREATE INDEX idx_poll_votes_user    ON poll_votes(user_id);
CREATE INDEX idx_poll_votes_option  ON poll_votes(option_id);

-- ============================================================
-- Seed Data  (matches frontend mockData.js)
-- ============================================================

-- Seed users (password_hash is bcrypt of 'password123')
INSERT INTO users (username, email, password_hash, avatar, karma, joined_date) VALUES
  ('CurrentUser',    'currentuser@test.com',    '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  12450, '2020-03-15'),
  ('CodeNewbie',     'codenewbie@test.com',     '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  1200,  '2024-01-10'),
  ('TechThoughts',   'techthoughts@test.com',   '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  4500,  '2023-06-01'),
  ('DesignMaster',   'designmaster@test.com',   '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  8900,  '2022-09-15'),
  ('StartupGuru',    'startupguru@test.com',    '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  15600, '2021-02-20'),
  ('ReactExpert',    'reactexpert@test.com',    '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  7800,  '2023-01-05'),
  ('CSSWizard',      'csswizard@test.com',      '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  3200,  '2024-03-20'),
  ('TechEnthusiast', 'techenthusiast@test.com', '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  22000, '2020-11-01'),
  ('CareerChanger',  'careerchanger@test.com',  '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  11500, '2021-07-15'),
  ('ReactFan42',     'reactfan42@test.com',     '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  2100,  '2024-05-01'),
  ('CSSPurist',      'csspurist@test.com',      '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  1800,  '2024-06-10'),
  ('FullStackDev',   'fullstackdev@test.com',   '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  5600,  '2023-04-01'),
  ('EdgeComputing',  'edgecomputing@test.com',  '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  3400,  '2024-02-15'),
  ('AISkeptic',      'aiskeptic@test.com',      '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  4100,  '2023-09-20'),
  ('UXResearcher',   'uxresearcher@test.com',   '$2b$10$Tv2yKR32HLOpMK5T3OAA.ugUCEzQ1nbTX6ca.3vSqa1ehlxSW7IDa', '👤',  6700,  '2022-12-01');

-- Seed subreddits
INSERT INTO subreddits (name, icon, member_count, color) VALUES
  ('Home',             '🏠', 0,       'bg-blue-500'),
  ('Popular',          '🔥', 0,       'bg-red-500'),
  ('Tech',             '💻', 4200000, 'bg-purple-500'),
  ('Health & Fitness', '💪', 1800000, 'bg-green-500'),
  ('Games',            '🎮', 3500000, 'bg-blue-400'),
  ('Food',             '🍕', 2100000, 'bg-orange-500'),
  ('Music',            '🎵', 2900000, 'bg-pink-500'),
  ('Travel',           '✈️',  1600000, 'bg-indigo-500'),
  ('Social',           '👥', 2400000, 'bg-amber-500');

-- Seed user-subreddit memberships for CurrentUser (id=1)
INSERT INTO user_subreddit_memberships (user_id, subreddit_id) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 9);

-- Seed posts (author IDs match the users above)
INSERT INTO posts (title, content, author_id, subreddit_id, upvotes, downvotes, comment_count, image, created_at) VALUES
  (
    'Just launched my first React project with Tailwind CSS!',
    'After weeks of learning, I finally built a functional todo app with authentication. The combination of React hooks and Tailwind utility classes made styling so much easier. Check it out and let me know what you think!',
    2, 3, 2450, 120, 3,
    'https://images.unsplash.com/photo-1633356122544-f134324ef6db?w=600&h=400&fit=crop',
    NOW() - INTERVAL '2 hours'
  ),
  (
    'The future of web development is here',
    'With advances in edge computing, serverless architecture, and AI-assisted coding, the landscape of web development has changed dramatically. What are your thoughts on these trends?',
    3, 3, 3120, 200, 2,
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop',
    NOW() - INTERVAL '5 hours'
  ),
  (
    'Best home workout routines for busy professionals',
    'I''ve been doing 30-minute HIIT sessions before work and the results have been incredible. Here are my top 5 routines that require zero equipment and fit into any schedule.',
    4, 4, 4780, 150, 1,
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=400&fit=crop',
    NOW() - INTERVAL '8 hours'
  ),
  (
    'Elden Ring DLC is the best expansion I have ever played',
    'Shadow of the Erdtree raises the bar for what DLC content should be. The new areas, bosses, and lore additions are phenomenal. FromSoftware has done it again!',
    5, 5, 5610, 180, 0,
    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&h=400&fit=crop',
    NOW() - INTERVAL '1 day'
  ),
  (
    'I perfected my sourdough bread recipe after 6 months',
    'After dozens of failed attempts, I finally nailed the perfect crispy crust and open crumb. Here''s my detailed recipe with tips on hydration, folding techniques, and baking temps.',
    6, 6, 6234, 90, 0,
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=400&fit=crop',
    NOW() - INTERVAL '2 days'
  ),
  (
    'Hidden gem albums you need to listen to in 2026',
    'I''ve been curating a playlist of under-the-radar releases this year. From indie folk to experimental electronic, these artists deserve way more recognition.',
    7, 7, 3450, 240, 0,
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&h=400&fit=crop',
    NOW() - INTERVAL '3 days'
  ),
  (
    'AI is transforming how we code',
    'GitHub Copilot, ChatGPT, and other AI tools are changing software development. This is a game changer for productivity.',
    8, 3, 8900, 450, 0,
    'https://images.unsplash.com/photo-1677442d019cecf8d424c73d60b0e1b0d5c5a5a?w=600&h=400&fit=crop',
    NOW() - INTERVAL '4 days'
  ),
  (
    'Solo backpacking through Southeast Asia - my 3 month itinerary',
    'Just got back from Thailand, Vietnam, and Cambodia. Budget was $30/day and I had the time of my life. Here''s everything you need to know for planning your own trip.',
    9, 8, 7120, 200, 0,
    'https://images.unsplash.com/photo-1528181304800-259b08848526?w=600&h=400&fit=crop',
    NOW() - INTERVAL '5 days'
  );

-- Seed comments (author IDs match above; postIds match posts)
INSERT INTO comments (post_id, author_id, parent_comment_id, text, upvotes, downvotes, created_at) VALUES
  (
    1, 10, NULL,
    'Great post! Tailwind CSS has really changed how I approach styling. The utility-first approach reduces CSS bloat by 60% according to the 2025 State of CSS survey. Combined with React''s component model, you get reusable, consistent UI without the hassle of naming conventions like BEM.',
    120, 5, NOW() - INTERVAL '2 hours'
  ),
  (
    1, 11, NULL,
    'I disagree that Tailwind is always better. It clutters your HTML with dozens of classes and makes it harder to maintain large projects. Traditional CSS with proper architecture (like ITCSS or SMACSS) scales just as well. The survey data doesn''t account for project complexity differences.',
    95, 12, NOW() - INTERVAL '1 hour'
  ),
  (
    1, 12, NULL,
    'Both approaches have merits. I''ve shipped production apps with both and the key factor is team familiarity, not the tool itself. What matters is consistency within the project. The real productivity gain from Tailwind comes from not context-switching between files.',
    78, 2, NOW() - INTERVAL '30 minutes'
  ),
  (
    2, 13, NULL,
    'Edge computing is the real game changer. Moving logic closer to users reduces latency by 40-70%. Cloudflare Workers and Deno Deploy are already proving this at scale. The serverless model works best when combined with edge, not as a standalone architecture.',
    210, 15, NOW() - INTERVAL '4 hours'
  ),
  (
    2, 14, NULL,
    'AI-assisted coding is overhyped. These tools generate plausible-looking code that passes initial tests but introduces subtle bugs. Studies from Microsoft Research show that AI-generated code has 40% more security vulnerabilities. We''re trading short-term speed for long-term technical debt.',
    185, 45, NOW() - INTERVAL '3 hours 30 minutes'
  ),
  (
    3, 15, NULL,
    'This is exactly what I needed! I''ve been struggling to fit workouts into my schedule. The no-equipment part is key — gym commutes eat up so much time. I started with your routine 2 and already feeling more energetic after just a week.',
    156, 8, NOW() - INTERVAL '7 hours'
  );
