const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const { getPool, sql } = require("../config/db");
const axios = require("axios");

const getUserId = (req) => {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try { return jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET).id; }
  catch { return null; }
};

// ── Colleges with search + filter ─────────────────────────────────────────
router.get("/colleges", async (req, res) => {
  try {
    const { q, type, city } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let where = "WHERE 1=1";
    if (q) {
      where += " AND name LIKE @q";
      request.input("q", sql.NVarChar, `%${q}%`);
    }
    if (type) {
      where += " AND type = @type";
      request.input("type", sql.NVarChar, type);
    }
    if (city) {
      where += " AND location LIKE @city";
      request.input("city", sql.NVarChar, `%${city}%`);
    }

    const result = await request.query(
      `SELECT * FROM Colleges ${where} ORDER BY createdAt DESC`
    );
    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Courses with search + filter ──────────────────────────────────────────
router.get("/courses", async (req, res) => {
  try {
    const { q, department } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let where = "WHERE 1=1";
    if (q) {
      where += " AND title LIKE @q";
      request.input("q", sql.NVarChar, `%${q}%`);
    }
    if (department) {
      where += " AND department LIKE @department";
      request.input("department", sql.NVarChar, `%${department}%`);
    }

    const result = await request.query(
      `SELECT * FROM AdminCourses ${where} ORDER BY createdAt DESC`
    );
    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notices ───────────────────────────────────────────────────────────────
router.get("/notices", async (_, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Notices ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications (notices + application status updates) ──────────────────
router.get("/notifications", async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool   = await getPool();

    const noticesResult = await pool.request()
      .query("SELECT TOP 20 * FROM Notices ORDER BY createdAt DESC");

    const notifs = noticesResult.recordset.map(n => ({
      id:       n.id,
      type:     "notice",
      title:    n.title,
      body:     n.body,
      category: n.category,
      time:     n.createdAt,
    }));

    if (userId) {
      const appsResult = await pool.request()
        .input("userId", sql.Int, userId)
        .query(`
          SELECT TOP 10 * FROM Applications
          WHERE userId = @userId AND status != 'Under Review'
          ORDER BY updatedAt DESC
        `);

      for (const app of appsResult.recordset) {
        notifs.unshift({
          id:       app.id,
          type:     "application",
          title:    app.status === "Accepted" ? "🎉 Application Accepted!" : "❌ Application Update",
          body:     app.status === "Accepted"
            ? `Your application to ${app.college} for ${app.course} has been accepted.`
            : `Your application to ${app.college} for ${app.course} was rejected.`,
          category: app.status === "Accepted" ? "Accepted" : "Rejected",
          time:     app.updatedAt,
        });
      }
    }

    notifs.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json(notifs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Daily Quote (proxy to external API to avoid CORS) ─────────────────────
router.get("/daily-quote", async (req, res) => {
  // ── Curated fallback list — picked by day-of-year so it changes daily ──
  const fallbackQuotes = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs", category: "inspire" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", category: "inspire" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein", category: "inspire" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", category: "inspire" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain", category: "inspire" },
    { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs", category: "life" },
    { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein", category: "inspire" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb", category: "life" },
    { text: "An unexamined life is not worth living.", author: "Socrates", category: "life" },
    { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu", category: "inspire" },
    { text: "Life is what happens when you're busy making other plans.", author: "John Lennon", category: "life" },
    { text: "Get busy living or get busy dying.", author: "Stephen King", category: "inspire" },
    { text: "You only live once, but if you do it right, once is enough.", author: "Mae West", category: "life" },
    { text: "Many of life's failures are people who did not realize how close they were to success when they gave up.", author: "Thomas Edison", category: "inspire" },
    { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky", category: "sports" },
    { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford", category: "inspire" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison", category: "inspire" },
    { text: "The mind is everything. What you think you become.", author: "Buddha", category: "inspire" },
    { text: "Twenty years from now you will be more disappointed by the things you didn't do.", author: "Mark Twain", category: "life" },
    { text: "Eighty percent of success is showing up.", author: "Woody Allen", category: "funny" },
    { text: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates", category: "management" },
    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", category: "inspire" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson", category: "inspire" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", category: "inspire" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James", category: "inspire" },
    { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau", category: "inspire" },
    { text: "Opportunities don't happen. You create them.", author: "Chris Grosser", category: "inspire" },
    { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller", category: "inspire" },
    { text: "There are no shortcuts to any place worth going.", author: "Beverly Sills", category: "inspire" },
    { text: "It's not whether you get knocked down; it's whether you get up.", author: "Vince Lombardi", category: "sports" },
    { text: "Leadership is not about being in charge. It is about taking care of those in your charge.", author: "Simon Sinek", category: "management" },
    { text: "The function of leadership is to produce more leaders, not more followers.", author: "Ralph Nader", category: "management" },
    { text: "Coming together is a beginning, staying together is progress, and working together is success.", author: "Henry Ford", category: "management" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar", category: "inspire" },
    { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke", category: "sports" },
    { text: "Dream big and dare to fail.", author: "Norman Vaughan", category: "inspire" },
    { text: "Failure is the condiment that gives success its flavor.", author: "Truman Capote", category: "funny" },
    { text: "The harder I work, the luckier I get.", author: "Samuel Goldwyn", category: "inspire" },
    { text: "A year from now you may wish you had started today.", author: "Karen Lamb", category: "inspire" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt", category: "inspire" },
    { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin", category: "inspire" },
    { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun", category: "inspire" },
    { text: "You are never too old to set another goal or dream a new dream.", author: "C.S. Lewis", category: "inspire" },
    { text: "What we think, we become.", author: "Buddha", category: "inspire" },
    { text: "First, have a definite, clear practical ideal — a goal, an objective.", author: "Aristotle", category: "inspire" },
    { text: "Quality means doing it right when no one is looking.", author: "Henry Ford", category: "management" },
    { text: "The key to success is to focus on goals, not obstacles.", author: "Anonymous", category: "inspire" },
    { text: "Perfection is not attainable, but if we chase perfection we can catch excellence.", author: "Vince Lombardi", category: "sports" },
    { text: "You don't need to see the whole staircase, just take the first step.", author: "Martin Luther King Jr.", category: "inspire" },
    { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt", category: "inspire" },
    { text: "Do not go where the path may lead; go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", category: "inspire" },
    { text: "To improve is to change; to be perfect is to change often.", author: "Winston Churchill", category: "management" },
    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs", category: "management" },
    { text: "The best revenge is massive success.", author: "Frank Sinatra", category: "inspire" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela", category: "inspire" },
    { text: "Every accomplishment starts with the decision to try.", author: "John F. Kennedy", category: "inspire" },
    { text: "Challenges are what make life interesting. Overcoming them is what makes life meaningful.", author: "Joshua J. Marine", category: "inspire" },
    { text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson", category: "inspire" },
    { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill", category: "inspire" },
    { text: "Winning isn't everything, but wanting to win is.", author: "Vince Lombardi", category: "sports" },
    { text: "Champions keep playing until they get it right.", author: "Billie Jean King", category: "sports" },
    { text: "Don't be pushed around by the fears in your mind. Be led by the dreams in your heart.", author: "Roy T. Bennett", category: "inspire" },
    { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington", category: "inspire" },
    { text: "If you are not willing to risk the usual, you will have to settle for the ordinary.", author: "Jim Rohn", category: "inspire" },
    { text: "Great minds discuss ideas; average minds discuss events; small minds discuss people.", author: "Eleanor Roosevelt", category: "inspire" },
  ];

  // Pick quote deterministically by day-of-year so it's the same quote all day
  // but automatically changes every midnight
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
  const todayIndex = dayOfYear % fallbackQuotes.length;
  const todayQuote = fallbackQuotes[todayIndex];
  const todayDate = now.toISOString().split('T')[0];

  try {
    const { category } = req.query;
    
    // Try external API first
    const categories = ['inspire', 'management', 'life', 'funny', 'students', 'sports'];
    const selectedCategory = category && categories.includes(category)
      ? category
      : categories[Math.floor(Math.random() * categories.length)];
    
    const quoteApiUrl = `https://quotes.rest/qod.json?category=${selectedCategory}`;
    
    const response = await axios.get(quoteApiUrl, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.data?.contents?.quotes?.[0]) {
      const quote = response.data.contents.quotes[0];
      return res.json({
        success: true,
        quote: {
          text: quote.quote,
          author: quote.author,
          category: quote.category,
          tags: quote.tags || [],
          date: quote.date || todayDate,
        },
      });
    }
  } catch (_) {
    // External API failed — fall through to curated list
  }

  // Return today's curated quote (changes every day at midnight)
  res.json({
    success: true,
    quote: {
      text: todayQuote.text,
      author: todayQuote.author,
      category: todayQuote.category,
      tags: [todayQuote.category],
      date: todayDate,
    },
  });
});

module.exports = router;
