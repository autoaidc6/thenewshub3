# TheNewsHub

TheNewsHub is a comprehensive, responsive news aggregator and reading application. It provides an optimized reading experience (strikingly fast, clear layout) with a focus on delivering high-quality news content, videos, podcasts, and worldwide information directly through a polished UI.

## Features

- **Modern User Interface**: Designed with React, Tailwind CSS, and Framer Motion for a fluid, accessible, and intuitive user experience.
- **Content Aggregation**: Automatically gathers and curates content from global RSS feeds across various categories (e.g., Live, Videos, World, Vibe, tech, business).
- **In-App Article Extraction**: Reads and cleans article content using advanced proxy endpoints (Mozilla Readability, jsdom). This gives you an ad-free, distraction-free reading view right inside the app.
- **YouTube and Video Features**: Plays videos and YouTube content seamlessly within the application wrapper without pushing you out to an external app by default.
- **Live Podcasts / Radio**: Supports HLS streams (hls.js) and Podcasts with an integrated playback engine.
- **Adaptive Layout**: Fully responsive mobile-first architecture utilizing `dvh` mapping to give edge-to-edge feel on tablets, iOS, and Android mobile devices. Fully scrollable sidebars, media views, and article displays.
- **AdSense Support**: Integrated optional hooks for Google AdSense implementation, fully customizable.
- **Weather / Location Context**: Connects with geospatial / weather proxies (`ipapi`) to bring region-specific weather right to your dashboard.
- **Serverless Backend**: Comes integrated with Netlify-compatible functions (`/.netlify/functions/*`) ported internally through an Express proxy wrapper for seamless local development and deployment. Includes:
  - `rss.js` proxy
  - `extract.js` deep reading extraction
  - `youtube.js` channel content fetcher
  - `podcast.js` podcast proxy extractor

## Tech Stack

- **Frontend**: React 19, Vite, TailwindCSS (v4), Framer Motion, Lucide React.
- **Backend / API**: Node.js, Express (local dev environment & full-stack rendering).
- **Parsing / Extractions**: `@mozilla/readability`, `jsdom`.
- **Media**: `hls.js`.

## Setup and Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   This will boot up the development server with Express acting as the orchestrator to resolve both standard Vite proxying as well as the `.netlify/functions/` backend proxies required for external CORS/Content fetching.

3. **Build Build**:
   ```bash
   npm run build
   ```

4. **Start Production**:
   ```bash
   npm start
   ```

## Key Project Files

- `src/NewsApp.tsx` - Main Application logic, categories, routing, and reader states.
- `src/constants.ts` - Dictionary definitions for sources, radio stations, podcast feeds, layout configurations.
- `server.ts` - Local Express wrapper replicating the production / proxy environment.
- `netlify/functions/*` - Micro-backend data manipulation routes. (Crucial for RSS reading bypasses and Content extractions).

## Design Philosophy

TheNewsHub relies on strict rules around typography (`Playfair Display`, `Inter`) and focuses on readability geometry (ideal golden width `~680px`, adaptive margins, structured contrast, large intuitive touch targets, and intelligent content overflow strategies). It relies heavily on reducing user friction while consuming varied media formats.

## License
MIT (or appropriate licensing)
