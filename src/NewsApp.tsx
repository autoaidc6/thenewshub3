import React, { useState, useEffect, useCallback, useRef } from "react";
import Hls from "hls.js";
import {
  T, RSS_SOURCES, YOUTUBE_SOURCES, CATEGORY_FILTERS, TRUSTED_SOURCES,
  MEDIA_SECTIONS, RADIO_STATIONS, PODCAST_FEEDS, VIBE_SECTIONS,
  CATEGORIES, BIAS, BIAS_STYLE, COUNTRY_KEYWORDS, WX, WORLD_REGIONS
} from "./constants";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const RSS_PROXY = "/.netlify/functions/rss?url=";
const CONTACT_EMAIL = "hello@hub4news.com";

function getBias(source) {
  if (!source) return null;
  if (BIAS[source]) return BIAS[source];
  const key = Object.keys(BIAS).find(k => source.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(source.toLowerCase()));
  return key ? BIAS[key] : null;
}

function detectCountryFlag(title, source) {
  const text = (title + " " + (source||"")).toLowerCase();
  for (const { flag, words } of COUNTRY_KEYWORDS) {
    if (words.some(w => text.includes(w))) return flag;
  }
  return null;
}

function passesFilter(article, category) {
  const filter = CATEGORY_FILTERS[category];
  if (!filter) return true;

  const sourceLower = (article.source || "").toLowerCase();
  const trusted = TRUSTED_SOURCES[category] || [];
  if (trusted.some(t => sourceLower.includes(t))) return true;

  const text = ((article.title || "") + " " + (article.description || "") + " " + sourceLower).toLowerCase();
  return filter.require.some(kw => text.includes(kw));
}

async function fetchFeed(url, delayMs = 0) {
  try {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    const res = await fetch(`${RSS_PROXY}${encodeURIComponent(url)}&count=10`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "ok") return [];
    const feedTitle = data.feed?.title || new URL(url).hostname.replace("www.", "");
    return (data.feed?.items || []).map(item => ({
      id:          item.guid || item.link || item.title,
      title:       stripHtml(item.title || ""),
      description: stripHtml(item.description || ""),
      url:         item.link || "",
      image:       item.image || extractImage(item.description) || null,
      source:      feedTitle,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      type:        "article",
    }));
  } catch { return []; }
}

async function fetchYouTubeFeed(channelId) {
  try {
    const res = await fetch(`/.netlify/functions/youtube?channelId=${channelId}&count=6`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(item => ({
      id:          `yt-${item.videoId}`,
      title:       item.title || "",
      description: item.description || "",
      url:         item.url || `https://www.youtube.com/watch?v=${item.videoId}`,
      image:       item.thumbnail || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
      source:      item.channelName || "YouTube",
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
      type:        "video",
      videoId:     item.videoId,
    }));
  } catch { return []; }
}

const stripHtml = h => {
  if (!h) return "";
  return h
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8211;/g, "—")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
};

function extractImage(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function isRTL(text) {
  if (!text) return false;
  return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text);
}

function timeAgo(date: any) {
  const d = (Date.now() - new Date(date).getTime()) / 1000;
  if (d < 60)    return "just now";
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

function dedupe(arr) {
  const seen = new Set();
  const seenId = new Set();
  return arr.filter(a => {
    const k = a.title.slice(0,60).toLowerCase();
    const id = a.id;
    if (seen.has(k) || (id && seenId.has(id))) return false;
    seen.add(k); 
    if (id) seenId.add(id);
    return true;
  });
}

function loadBookmarks() { try { return JSON.parse(localStorage.getItem("thenewsBookmarks") || "[]"); } catch { return []; } }
function saveBookmarks(bm) { try { localStorage.setItem("thenewsBookmarks", JSON.stringify(bm)); } catch {} }

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

function SkeletonCard({ featured, th }: any) {
  return (
    <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, padding:featured?"1.5rem":"1.25rem", display:"flex", flexDirection:"column", gap:"0.75rem", borderRadius:8 }}>
      <div style={{ height:12, width:"35%", background:th.bgSkeleton1 }} />
      <div style={{ height:featured?24:16, background:th.bgSkeleton1 }} />
      <div style={{ height:featured?24:16, width:"75%", background:th.bgSkeleton1 }} />
      {featured && <div style={{ height:180, background:th.bgSkeleton1 }} />}
      <div style={{ height:12, background:th.bgSkeleton1 }} />
      <div style={{ height:12, width:"55%", background:th.bgSkeleton1 }} />
    </div>
  );
}

function CountryFlag({ title, source }: any) {
  const flag = detectCountryFlag(title, source);
  if (!flag) return null;
  return <span style={{ fontSize:"0.8rem", lineHeight:1, flexShrink:0 }}>{flag}</span>;
}

function BiasDot({ source }: any) {
  const bias = getBias(source);
  if (!bias) return null;
  const style = BIAS_STYLE[bias.rating];
  if (!style) return null;
  return (
    <div style={{ width:7, height:7, borderRadius:"50%", background:style.color, border:`1.5px solid ${style.color}`, opacity:0.85, flexShrink:0 }} title={style.label} />
  );
}

function NewsCard({ article, featured, onRead, th, bookmarks, onBookmark, activeCategory }: any) {
  const [hovered, setHovered] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const isBookmarked = bookmarks.some((b: any) => b.id === article.id);

  const isLiveBreaking = featured && activeCategory === "top";
  const rtl = isRTL(article.title + " " + article.description);
  const langDir = rtl ? "rtl" : "ltr";

  return (
    <article
      dir={langDir}
      onClick={() => onRead('in-app')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? th.bgCardHover : th.bgCard,
        border: `1px solid ${th.border}`,
        padding: "1.25rem",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.2s",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gridColumn: featured ? "1 / -1" : "auto",
        textAlign: rtl ? "right" : "left",
      }}
      className="group"
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1rem", flexDirection: rtl ? "row-reverse" : "row" }}>
        <span style={{ fontSize:"0.625rem", fontFamily:"monospace", color:th.textSource, textTransform:"uppercase", letterSpacing:"0.05em", display:"flex", alignItems:"center", gap:"0.5rem", flexDirection: rtl ? "row-reverse" : "row" }}>
          {isLiveBreaking && (
            <span className="live-pulse" style={{ background: th.live || "red", color: "#fff", padding: "0.15rem 0.4rem", borderRadius: 4, fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                <span style={{ width: 4, height: 4, background: "#fff", borderRadius: "50%" }}></span> LIVE
            </span>
          )}
          {article.source} • {timeAgo(article.publishedAt)}
        </span>
        <span style={{ opacity: hovered ? 1 : 0, transition:"opacity 0.2s", color:th.textMuted }}>↗</span>
      </div>

      {featured && article.image && !imgErr && (
        <div style={{ marginBottom:"1.5rem", overflow:"hidden", borderRadius:4 }}>
          <img src={article.image} alt="" loading="lazy" onError={()=>setImgErr(true)} style={{ width:"100%", height:"300px", objectFit:"cover", filter:th.bg==="#080809"?"grayscale(20%)":"", display:"block" }} />
        </div>
      )}

      {/* Title & THUMBNAIL for non-featured */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:featured?"2rem":"1.25rem", fontWeight:900, color:th.textHead, lineHeight:1.2, margin:0, letterSpacing:"-0.02em", flex: 1 }}>
          {article.title}
        </h2>
        {!featured && article.image && !imgErr && (
           <div style={{ width: "80px", height: "80px", flexShrink: 0, overflow: "hidden", borderRadius: 4 }}>
             <img src={article.image} alt="" loading="lazy" onError={()=>setImgErr(true)} style={{ width:"100%", height:"100%", objectFit:"cover", filter:th.bg==="#080809"?"grayscale(20%)":"", display:"block" }} />
           </div>
        )}
      </div>
      
      {article.description && (
        <p style={{ fontFamily:"'Source Serif 4', 'Charter', serif", color:th.textBody, fontSize:featured?"1rem":"0.875rem", lineHeight:1.6, margin:0, display:"-webkit-box", WebkitLineClamp:featured?3:2, WebkitBoxOrient:"vertical", overflow:"hidden", marginBottom:"1.5rem" }}>
          {article.description}
        </p>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginTop:"auto", flexWrap:"wrap" }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onRead('in-app')} style={{ background:th.bgInput, border:`1px solid ${th.border}`, color:th.textHead, fontSize:"0.625rem", padding:"0.4rem 0.6rem", borderRadius:4, cursor:"pointer", textTransform:"uppercase", fontWeight:"bold" }}>Read In-App</button>
        <button onClick={() => onRead('browser')} style={{ background:th.bgInput, border:`1px solid ${th.border}`, color:th.textHead, fontSize:"0.625rem", padding:"0.4rem 0.6rem", borderRadius:4, cursor:"pointer", textTransform:"uppercase", fontWeight:"bold" }}>Browser ↗</button>
        <div style={{ height:1, flex:1, background:th.border }}></div>
        <button onClick={(e)=>{e.stopPropagation(); if (navigator.share && article.url) navigator.share({title: article.title, url: article.url}).catch(()=>{window.open(article.url)}); else window.open(article.url); }} style={{ background:"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:"0.25rem", opacity: 0.6, transition:"opacity 0.2s" }} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.6"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.textHead} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
        </button>
        <button onClick={(e)=>{e.stopPropagation();onBookmark(article);}} style={{ background:"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:"0.25rem", opacity: 0.6, transition:"opacity 0.2s" }} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.6"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isBookmarked ? th.textHead : "none"} stroke={th.textHead} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>
    </article>
  );
}

function VideoCard({ video, onPlay, th }: any) {
  const [hovered, setHovered] = useState(false);
  return (
    <article
      onClick={() => onPlay('choose')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? th.bgCardHover : th.bgCard,
        border: `1px solid ${th.border}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.2s, transform 0.2s",
        transform: hovered ? "translateY(-2px)" : "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ position:"relative", paddingTop:"56.25%", background:th.bgSkeleton1 }}>
        <img src={video.image} alt={video.title} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", objectFit:"cover" }} />
        <div style={{ position:"absolute", bottom:"0.5rem", right:"0.5rem", background:"rgba(0,0,0,0.8)", padding:"0.25rem 0.5rem", borderRadius:4, fontSize:"0.625rem", color:"white", fontFamily:"monospace", fontWeight:"bold", display:"flex", alignItems:"center", gap:"0.25rem" }}>
          <span style={{ width:6, height:6, background:"red", borderRadius:"50%" }}></span> LIVE
        </div>
      </div>
      <div style={{ padding:"1.25rem", display:"flex", flexDirection:"column", flex:1 }}>
         <span style={{ fontSize:"0.625rem", fontFamily:"monospace", color:th.textSource, textTransform:"uppercase", marginBottom:"0.5rem", display:"flex", alignItems:"center", gap:"0.5rem" }}>
          📺 {video.source}
        </span>
        <h3 style={{ fontSize:"1rem", fontWeight:700, color:th.textHead, lineHeight:1.3, margin:"0 0 0.5rem 0", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{video.title}</h3>
        <p style={{ fontSize:"0.75rem", color:th.textBody, margin:0, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{video.description}</p>
        <div style={{ marginTop:"auto", paddingTop:"1rem", display:"flex", justifyContent:"space-between", alignItems:"center" }} onClick={e => e.stopPropagation()}>
           <span style={{ fontSize:"0.625rem", color:th.textMuted }}>{timeAgo(video.publishedAt)}</span>
        </div>
      </div>
    </article>
  );
}

function PodcastCard({ podcast, onPlay, th }: any) {
  const [hovered, setHovered] = useState(false);
  return (
    <article
      onClick={() => onPlay('in-app')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? th.bgCardHover : th.bgCard,
        border: `1px solid ${th.border}`,
        borderRadius: 8,
        padding: "1.25rem",
        cursor: "pointer",
        transition: "all 0.2s",
        display: "flex",
        gap: "1.25rem",
        height: "100%",
        alignItems: "center"
      }}
    >
      <div style={{ width: 80, height: 80, borderRadius: 8, overflow: "hidden", flexShrink:0, background:th.bgSkeleton1 }}>
        {podcast.image && <img src={podcast.image} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />}
      </div>
      <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
        <span style={{ fontSize:"0.625rem", fontFamily:"monospace", color:th.textSource, textTransform:"uppercase", marginBottom:"0.5rem", letterSpacing:"0.05em" }}>
          {podcast.podcast || "Podcast"}
        </span>
        <h3 style={{ fontSize:"1rem", fontWeight:700, color:th.textHead, lineHeight:1.3, margin:"0 0 0.5rem 0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {podcast.title}
        </h3>
        <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginTop:"auto", flexWrap:"wrap" }} onClick={e => e.stopPropagation()}>
           <button onClick={() => onPlay('in-app')} style={{ background:th.bgInput, border:`1px solid ${th.border}`, color:th.textHead, fontSize:"0.625rem", padding:"0.3rem 0.6rem", borderRadius:4, cursor:"pointer", textTransform:"uppercase", fontWeight:"bold", fontFamily:"monospace" }}>IN-APP ▶</button>
           <button onClick={() => onPlay('browser')} style={{ background:th.bgInput, border:`1px solid ${th.border}`, color:th.textHead, fontSize:"0.625rem", padding:"0.3rem 0.6rem", borderRadius:4, cursor:"pointer", textTransform:"uppercase", fontWeight:"bold", fontFamily:"monospace" }}>web ↗</button>
           
           <span style={{ fontSize:"0.625rem", fontFamily:"monospace", color:th.textMuted, marginLeft: "auto" }}>
             {podcast.duration} &nbsp; {timeAgo(podcast.publishedAt)}
           </span>
        </div>
      </div>
    </article>
  );
}

function RadioCard({ radio, onPlay, th }: any) {
  const [hovered, setHovered] = useState(false);
  return (
    <article
      onClick={() => onPlay('in-app')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? th.bgCardHover : th.bgCard,
        border: `1px solid ${th.border}`,
        borderRadius: 8,
        padding: "1.5rem",
        cursor: "pointer",
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "100%",
        flexWrap: "wrap",
        gap: "1rem"
      }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: th.bgSkeleton2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.25rem", border:`1px solid ${th.borderSub}` }}>
          📻
        </div>
        <div>
          <div style={{ fontSize:"0.625rem", fontFamily:"monospace", color:th.textMuted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"0.25rem", display:"flex", alignItems:"center", gap:"0.5rem" }}>
            {radio.country} {radio.genre}
          </div>
          <h3 style={{ fontSize:"1.125rem", fontWeight:800, color:th.textHead, margin:0, letterSpacing:"-0.02em" }}>{radio.name}</h3>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onPlay('in-app')} style={{ background:th.accentBg, border:`1px solid ${th.accent}`, color:th.accent, fontSize:"0.625rem", padding:"0.3rem 0.6rem", borderRadius:4, cursor:"pointer", textTransform:"uppercase", fontWeight:"bold", fontFamily:"monospace" }}>PLAY</button>
        <button onClick={() => onPlay('browser')} style={{ background:th.bgInput, border:`1px solid ${th.border}`, color:th.textHead, fontSize:"0.625rem", padding:"0.3rem 0.6rem", borderRadius:4, cursor:"pointer", textTransform:"uppercase", fontWeight:"bold", fontFamily:"monospace" }}>EXT ↗</button>
      </div>
    </article>
  );
}


function ArticleReader({ article, th, isMobile }: any) {
  const [content, setContent] = useState<any>({ type: "loading" });
  
  const rtl = isRTL(article.title + " " + article.description);
  const langDir = rtl ? "rtl" : "ltr";
  const textForLang = article.title + " " + article.description;
  const lang = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(textForLang) ? "arabic" : 
               /[\u1200-\u137F]/.test(textForLang) ? "eritrea" : "en";

  useEffect(() => {
    let active = true;
    setContent({ type: "loading" });
    fetch(`/.netlify/functions/extract?url=${encodeURIComponent(article.url)}`)
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        if (data.error) {
          setContent({ type: "error", message: data.error });
        } else if (data.text || data.html) {
          setContent({ type: "success", text: data.text, html: data.html });
        } else {
          setContent({ type: "error", message: "Failed to extract." });
        }
      })
      .catch(e => {
        if (active) setContent({ type: "error", message: e.message });
      });
    return () => { active = false; };
  }, [article.url]);

  return (
    <div dir={langDir} style={{ padding: isMobile ? "1.5rem 1.25rem" : "4rem 2rem", maxWidth: 680, margin: "0 auto", fontSize: isMobile ? "18px" : "20px", lineHeight: 1.6, color: th.textBody, fontFamily: rtl ? "'Amiri', serif" : "'Source Serif 4', 'Charter', serif", textAlign: rtl ? "right" : "left" }}>
       {article.image && <img src={article.image} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: "2rem" }} />}
       
       <h1 style={{ fontFamily: rtl ? "'Amiri', serif" : "'Playfair Display', Georgia, serif", fontSize: isMobile ? "1.75rem" : "2.5rem", fontWeight: 900, color: th.textHead, marginBottom: "1.5rem", lineHeight: 1.2, letterSpacing: rtl ? 0 : "-0.02em" }}>{article.title}</h1>
       
       <div style={{ fontSize: "0.875rem", color: th.textSource, marginBottom: "3rem", fontFamily: "system-ui, sans-serif", textTransform: rtl ? "none" : "uppercase", letterSpacing: rtl ? 0 : "0.05em", borderBottom: `1px solid ${th.border}`, paddingBottom: "1.5rem", display: "flex",flexDirection: rtl ? "row-reverse" : "row", gap: "0.5rem" }}>
         {article.source} <span style={{color: th.textMuted}}>• {new Date(article.publishedAt).toLocaleString()}</span>
       </div>
       
       {content.type === "loading" && (
           <div style={{ textAlign: "left", padding: "1rem 0" }}>
               {[...Array(4)].map((_, i) => (
                   <div key={i} style={{ marginBottom: "2rem" }}>
                       <div style={{ height: "1em", background: th.bgSkeleton2, marginBottom: "0.6em", borderRadius: 4, width: "100%" }} />
                       <div style={{ height: "1em", background: th.bgSkeleton2, marginBottom: "0.6em", borderRadius: 4, width: "100%" }} />
                       <div style={{ height: "1em", background: th.bgSkeleton2, marginBottom: "0.6em", borderRadius: 4, width: "100%" }} />
                       <div style={{ height: "1em", background: th.bgSkeleton2, marginBottom: "0.6em", borderRadius: 4, width: "80%" }} />
                   </div>
               ))}
           </div>
       )}
       
       {content.type === "error" && (
         <div style={{ padding: "2rem", background: th.bgSkeleton1, borderRadius: 8, border: `1px solid ${th.border}`, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
           <h3 style={{ color: th.textHead, marginTop: 0 }}>Extraction Unsuccessful</h3>
           <p style={{ color: th.textMuted, fontSize: "0.875rem" }}>The article structure could not be parsed automatically.</p>
           
           <div style={{ marginTop: "2rem", textAlign: "left" }}>
             <h4 style={{ color: th.textHead, fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Brief Summary:</h4>
             <p style={{ fontStyle: "italic", color: th.textBody, fontSize: "1.125rem", lineHeight: 1.6, marginTop: "0.5rem" }}>{article.description}</p>
           </div>
           
           <button onClick={() => window.open(article.url, "_blank")} style={{ padding: "0.75rem 1.5rem", background: th.accentBg, color: th.accent, border: `1px solid ${th.accentBord||th.accent}`, borderRadius: 8, cursor: "pointer", marginTop: "2rem", fontSize: "0.875rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>
             Read Original Article ↗
           </button>
         </div>
       )}
       
       {content.type === "success" && (
         <div className="article-container" style={{ overflowWrap: "break-word" }}>
             {content.html ? (
                <>
                  <div dangerouslySetInnerHTML={{ __html: content.html }} />
                  <AdUnit format="horizontal" lang={lang} />
                </>
             ) : (
               content.text.split(/\n\s*\n/).filter((p: string) => p.trim() !== "").map((pLine: string, i: number) => (
                 <React.Fragment key={i}>
                   <p>{pLine.trim()}</p>
                   {i === 1 && <AdUnit format="horizontal" lang={lang} />}
                 </React.Fragment>
               ))
             )}
             <div style={{ marginTop: "4rem", borderTop: `1px solid ${th.border}`, paddingTop: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
                 <button onClick={() => window.open(article.url, "_blank")} style={{ padding: "0.75rem 1.5rem", background: "transparent", color: th.textMuted, border: `1px solid ${th.border}`, borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                   View Original Source ↗
                 </button>
             </div>
         </div>
       )}
    </div>
  );
}

function AudioPlayerBar({ item, th, isMobile, onClose }: any) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const srcUrl = item.url || item.mp3;
    
    let hls: Hls | null = null;
    
    if (srcUrl && srcUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(srcUrl);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch(e => console.log(e));
          setIsPlaying(true);
        });
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = srcUrl;
        audio.addEventListener('loadedmetadata', () => {
          audio.play().catch(e => console.log(e));
          setIsPlaying(true);
        });
      }
    } else if (srcUrl) {
      audio.src = srcUrl;
      audio.play().catch(e => console.log(e));
      setIsPlaying(true);
    }
    
    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [item]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };
  
  const skip = (secs: number) => {
    if (audioRef.current) audioRef.current.currentTime += secs;
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0':''}${s}`;
  };

  const handleSeek = (e: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (audioRef.current && duration) {
       audioRef.current.currentTime = percent * duration;
    }
  };

  const isRadio = !!item.genre;
  const image = item.image || item.thumbnail;
  const title = item.title || item.name;
  const subtitle = item.source || item.podcast || item.genre;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, height: isMobile ? 120 : 80,
      background: th.bgHeader, borderTop: `1px solid ${th.border}`,
      display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", justifyContent: isMobile ? "space-between" : "space-between",
      padding: isMobile ? "0.75rem 1rem" : "0 2rem", zIndex: 10000, boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
      color: th.textHead
    }}>
      <audio ref={audioRef} preload="none" />
      
      {isMobile ? (
        <>
          <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {image ? (
              <img src={image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: `1px solid ${th.border}` }} />
            ) : (
               <div style={{ width: 40, height: 40, borderRadius: 8, background: th.bgSkeleton2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>📻</div>
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 600, fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
              <div style={{ color: th.textSource, fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: th.textMuted, cursor: "pointer", display: "flex", alignItems: "center", padding: "0.5rem" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              {!isRadio && (
                <button onClick={() => skip(-15)} style={{ background: "transparent", border: "none", color: th.textBody, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="12" y="15" fontSize="8" strokeWidth="1" stroke="none" fill="currentColor" textAnchor="middle">15</text></svg>
                </button>
              )}
              <button onClick={togglePlay} style={{ background: "transparent", border: "none", color: th.textHead, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isPlaying ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                )}
              </button>
              {!isRadio && (
                <button onClick={() => skip(30)} style={{ background: "transparent", border: "none", color: th.textBody, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11V9a4 4 0 0 0-4-4H3"></path><polyline points="17 23 21 19 17 15"></polyline><path d="M3 13v2a4 4 0 0 0 4 4h14"></path><text x="12" y="15" fontSize="8" strokeWidth="1" stroke="none" fill="currentColor" textAnchor="middle">30</text></svg>
                </button>
              )}
            </div>
            
            {!isRadio && (
               <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={handleSeek}>
                 <span style={{ fontSize: "0.625rem", color: th.textMuted }}>{formatTime(currentTime)}</span>
                 <div style={{ flex: 1, height: 4, background: th.bgSkeleton1, borderRadius: 2, position: "relative", overflow: "hidden" }}>
                   <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, background: th.accent, width: `${duration ? (currentTime/duration)*100 : 0}%` }} />
                 </div>
                 <span style={{ fontSize: "0.625rem", color: th.textMuted }}>{formatTime(duration)}</span>
               </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* LEFT: Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", minWidth: 200 }}>
            {!isRadio && (
              <button onClick={() => skip(-15)} style={{ background: "transparent", border: "none", color: th.textBody, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="12" y="15" fontSize="8" strokeWidth="1" stroke="none" fill="currentColor" textAnchor="middle">15</text></svg>
              </button>
            )}
            <button onClick={togglePlay} style={{ background: "transparent", border: "none", color: th.textHead, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              )}
            </button>
            {!isRadio && (
              <button onClick={() => skip(30)} style={{ background: "transparent", border: "none", color: th.textBody, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11V9a4 4 0 0 0-4-4H3"></path><polyline points="17 23 21 19 17 15"></polyline><path d="M3 13v2a4 4 0 0 0 4 4h14"></path><text x="12" y="15" fontSize="8" strokeWidth="1" stroke="none" fill="currentColor" textAnchor="middle">30</text></svg>
              </button>
            )}
          </div>

          {/* CENTER: Track Info & Progress */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", margin: "0 2rem", maxWidth: 800 }}>
            {image ? (
              <img src={image} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", marginRight: "1rem", border: `1px solid ${th.border}` }} />
            ) : (
               <div style={{ width: 56, height: 56, borderRadius: 8, background: th.bgSkeleton2, marginRight: "1rem", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem" }}>📻</div>
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
               <div style={{ fontWeight: 600, fontSize: "0.9375rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{title}</div>
               <div style={{ color: th.textSource, fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
               
               {!isRadio && (
                 <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: 4, cursor: "pointer" }} onClick={handleSeek}>
                   <span style={{ fontSize: "0.75rem", color: th.textMuted, width: 32 }}>{formatTime(currentTime)}</span>
                   <div style={{ flex: 1, height: 4, background: th.bgSkeleton1, borderRadius: 2, position: "relative", overflow: "hidden" }}>
                     <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, background: th.accent, width: `${duration ? (currentTime/duration)*100 : 0}%` }} />
                   </div>
                   <span style={{ fontSize: "0.75rem", color: th.textMuted, width: 32, textAlign: "right" }}>{formatTime(duration)}</span>
                 </div>
               )}
            </div>
          </div>

          {/* RIGHT: Close & Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 100, justifyContent: "flex-end" }}>
             <button onClick={onClose} style={{ background: "transparent", border: "none", color: th.textMuted, cursor: "pointer", display: "flex", alignItems: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
             </button>
          </div>
        </>
      )}
    </div>
  );
}

function AdUnit({ format = "auto", style = {}, lang = "en" }: { format?: string, style?: any, lang?: string }) {
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      }
    } catch (e) {
      console.log("AdSense error", e);
    }
  }, []);

  let adLabel = "Advertisement";
  if (lang === "arabic") adLabel = "إعلان";
  else if (lang === "eritrea") adLabel = "መወዓውዒ";

  return (
    <div style={{ padding: "1.5rem", textAlign: "center", border: "1px dashed rgba(128,128,128,0.2)", borderRadius: 8, margin: "1rem 0", background: "rgba(128,128,128,0.05)", ...style }}>
      <span style={{ display: "block", fontSize: "0.625rem", color: "gray", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>{adLabel}</span>
      <ins className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot="XXXXXXXXXX"
        data-ad-format={format}
        data-full-width-responsive="true"></ins>
    </div>
  );
}

function StaticPage({ page, th }: { page: string, th: any }) {
  const contentMap: Record<string, { title: string, content: React.ReactNode }> = {
    about: {
      title: "About TheNewsHub",
      content: (
        <>
          <p>TheNewsHub is a minimalist, readability-focused news aggregator aiming to provide the most important updates without distraction.</p>
          <p>We believe in high-quality typography, minimal interfaces, and removing the clutter often found on news websites. Drawing inspiration from top editorial standards, our platform ensures reading is a peaceful, focused experience.</p>
          <p>All news articles are aggregated from trusted sources using RSS feeds and curated live updates.</p>
        </>
      )
    },
    contact: {
      title: "Contact Us",
      content: (
        <>
          <p>Have questions, feedback, or suggestions? We'd love to hear from you.</p>
          <p>You can reach out to our support and editorial team at:</p>
          <p><strong>Email:</strong> {CONTACT_EMAIL}</p>
        </>
      )
    },
    privacy: {
      title: "Privacy Policy",
      content: (
        <>
          <p>At TheNewsHub, we respect your privacy. This policy outlines our limited data collection practices.</p>
          <p><strong>Data we collect:</strong> We temporarily determine your approximate geolocation to provide localized news (e.g. UK Top News). This happens on the client-side, and no personal identifiable location data is stored on our servers.</p>
          <p><strong>Cookies & Tracking:</strong> We do not use third-party tracking cookies or invasive analytics. Your bookmarks and preferences are stored locally on your device.</p>
        </>
      )
    }
  };

  const pageData = contentMap[page];

  if (!pageData) return null;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "4rem 2rem", minHeight: "60vh" }}>
      <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "2.5rem", fontWeight: 900, color: th.textHead, marginBottom: "2rem", letterSpacing: "-0.02em" }}>{pageData.title}</h1>
      <div className="article-container" style={{ fontSize: "1.125rem", color: th.textBody }}>
        {pageData.content}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function NewsApp() {
  const [night, setNight] = useState(false);
  const [activeCategory, setActiveCategory] = useState("top");
  const [activePage, setActivePage] = useState("home");
  const [subTab, setSubTab] = useState<string|null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [readerItem, setReaderItem] = useState<any>(null);
  const [choiceItem, setChoiceItem] = useState<any>(null);
  const [audioItem, setAudioItem] = useState<any>(null);
  const [userCountry, setUserCountry] = useState<string|null>(null);
  const [weather, setWeather] = useState<{ temp: number, icon: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (readerItem || choiceItem) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => { 
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [readerItem, choiceItem]);

  
  const [articles, setArticles] = useState([]);
  const [videos, setVideos] = useState([]);
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [bookmarks, setBookmarks] = useState(loadBookmarks);

  // SEO Schema Injection
  useEffect(() => {
    // Remove old schema scripts
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove());

    const schemas: any[] = [];
    const baseURL = "https://hub4news.com";

    if (!readerItem) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "The News Hub",
        "url": baseURL,
        "logo": `${baseURL}/android-chrome-512x512.png`
      });
      schemas.push({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "The News Hub",
        "url": baseURL,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${baseURL}/?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      });
      if (articles.length > 0) {
        schemas.push({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "itemListElement": articles.slice(0, 10).map((a: any, i) => {
            const txt = a.title + " " + a.description;
            const lang = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(txt) ? "ar" : /[\u1200-\u137F]/.test(txt) ? "ti" : "en";
            return {
              "@type": "ListItem",
              "position": i + 1,
              "item": {
                "@type": "NewsArticle",
                "inLanguage": lang,
                "headline": a.title,
                "url": a.url,
                "datePublished": a.publishedAt,
                "author": {
                  "@type": "Organization",
                  "name": a.source || "Unknown"
                }
              }
            };
          })
        });
      }
    } else if (readerItem.type === "article") {
      const art = readerItem.item;
      const txt = (art.title || "") + " " + (art.description || "");
      const lang = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(txt) ? "ar" : /[\u1200-\u137F]/.test(txt) ? "ti" : "en";
      schemas.push({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "inLanguage": lang,
        "headline": art.title,
        "image": [ art.image || `${baseURL}/android-chrome-512x512.png` ],
        "datePublished": art.publishedAt,
        "author": [{
          "@type": "Person",
          "name": "The News Hub Staff",
          "url": baseURL
        }]
      });
    }

    schemas.forEach(schema => {
      const script = document.createElement('script');
      script.type = "application/ld+json";
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
    });
  }, [articles, readerItem]);

  const th = night ? T.night : T.day;

  // Determine user country and weather
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        if (data && data.country_code) setUserCountry(data.country_code);
        else {
           const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
           if (tz.includes("London") || tz.includes("Europe/Belfast")) setUserCountry("GB");
        }
        
        if (data && data.latitude && data.longitude) {
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${data.latitude}&longitude=${data.longitude}&current_weather=true`)
            .then(r => r.json())
            .then(wData => {
               if (wData.current_weather) {
                  const code = wData.current_weather.weathercode;
                  setWeather({
                    temp: Math.round(wData.current_weather.temperature),
                    icon: (WX as any)[code]?.icon || "🌤"
                  });
               }
            }).catch(()=>{});
        }
      })
      .catch(() => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz.includes("London") || tz.includes("Europe/Belfast")) setUserCountry("GB");
      });
  }, []);

  // Sync subTabs
  useEffect(() => {
    if (activeCategory === "live" && !MEDIA_SECTIONS.some(s=>s.id===subTab)) setSubTab("video");
    else if (activeCategory === "vibe" && !VIBE_SECTIONS.some(s=>s.id===subTab)) setSubTab("goodnews");
    else if (activeCategory === "world" && !WORLD_REGIONS.some(s=>s.id===subTab)) setSubTab("world");
  }, [activeCategory, subTab]);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (activeCategory === "live") {
        if (subTab === "video" || !subTab) {
          const res = await Promise.allSettled(YOUTUBE_SOURCES.live.map((id:string) => fetchYouTubeFeed(id)));
          let fetchedVideos = res.flatMap((r:any) => r.status === "fulfilled" ? r.value : []);
          if (fetchedVideos.length === 0) {
            fetchedVideos = [
              { id: "yt-9Auq9mYxFEE", title: "Sky News Live", description: "Watch Sky News live", url: "https://www.youtube.com/watch?v=9Auq9mYxFEE", image: "https://img.youtube.com/vi/9Auq9mYxFEE/hqdefault.jpg", source: "Sky News", publishedAt: new Date(), type: "video", videoId: "9Auq9mYxFEE" },
              { id: "yt-bbyp5qXEL0c", title: "Al Jazeera English Live", description: "Stay updated with the latest news from Al Jazeera.", url: "https://www.youtube.com/watch?v=bbyp5qXEL0c", image: "https://img.youtube.com/vi/bbyp5qXEL0c/hqdefault.jpg", source: "Al Jazeera", publishedAt: new Date(), type: "video", videoId: "bbyp5qXEL0c" },
              { id: "yt-0bE1bI8tO3A", title: "DW News Live", description: "News from Germany and the world.", url: "https://www.youtube.com/watch?v=0bE1bI8tO3A", image: "https://img.youtube.com/vi/0bE1bI8tO3A/hqdefault.jpg", source: "DW News", publishedAt: new Date(), type: "video", videoId: "0bE1bI8tO3A" }
            ];
          }
          setVideos(fetchedVideos as never[]);
        } else if (subTab === "podcasts") {
          const res = await Promise.allSettled(PODCAST_FEEDS.map(url => fetch(`/.netlify/functions/podcast?url=${encodeURIComponent(url)}`).then(r=>r.json())));
          setPodcasts(res.flatMap(r => r.status === "fulfilled" && !r.value.error ? [r.value] : []));
        }
      } else {
        const feedKey = activeCategory === "vibe" ? (subTab || "goodnews") : activeCategory === "world" ? (subTab || "world") : activeCategory;
        let urlsToFetch = RSS_SOURCES[feedKey] || [];
        const isUKTop = feedKey === "top" && userCountry === "GB";
        if (isUKTop) {
            urlsToFetch = [...(RSS_SOURCES["uk"] || []), ...urlsToFetch];
        }
        
        const res = await Promise.allSettled(urlsToFetch.map((url:string) => fetchFeed(url)));
        let all = res.flatMap((r:any, idx:number) => 
            r.status === "fulfilled" ? r.value.map((item:any) => ({...item, _isUK: (isUKTop && idx < (RSS_SOURCES["uk"] || []).length)})) : []
        );
        let filtered = all.filter(a => passesFilter(a, feedKey));
        if (filtered.length < 3) filtered = all;
        setArticles(dedupe(filtered).sort((a:any,b:any)=>{
            if (a._isUK && !b._isUK) return -1;
            if (!a._isUK && b._isUK) return 1;
            return new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime();
        }));
      }
    } catch(e) { 
      setError((e as Error).message); 
    } finally { 
      setLoading(false); 
    }
  }, [activeCategory, subTab, userCountry]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleBookmark = (article: any) => {
    setBookmarks((prev: any) => {
      const exists = prev.some((b: any)=>b.id===article.id);
      const next   = exists ? prev.filter((b: any)=>b.id!==article.id) : [article,...prev];
      saveBookmarks(next);
      return next;
    });
  };

  const filteredArticles = articles.filter((a: any) => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || (a.description||"").toLowerCase().includes(searchQuery.toLowerCase()));
  const featured = filteredArticles[0] || null;
  const mixed = filteredArticles.slice(1);
  
  const filteredVideos = videos.filter((v: any) => v.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredPodcasts = podcasts.filter((p: any) => p.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredRadio = RADIO_STATIONS.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.genre.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight:"100vh", background:th.bg, color:th.text, transition:"background 0.3s, color 0.3s", width:"100%", overflowX: "hidden", fontFamily:"system-ui, sans-serif" }}>
      
      {/* HEADER */}
      <header style={{ padding: isMobile ? "1rem" : "1.25rem 2rem", display:"flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "1rem" : "0", justifyContent:"space-between", alignItems:"center", background:th.bgHeader, borderBottom:`1px solid ${th.border}` }}>
        {isMobile ? (
          <>
            <div style={{ display:"flex", width:"100%", justifyContent:"space-between", alignItems:"center" }}>
              <h1 onClick={() => setActivePage("home")} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontFamily:"'Playfair Display', serif", fontWeight:900, fontSize: "1.75rem", color:th.textHead, margin:0, letterSpacing:"-0.03em", textTransform: "uppercase" }}>
                <img src="/favicon.svg" alt="Logo" style={{ width: 32, height: 32, borderRadius: 6 }} />
                THE NEWS HUB <span style={{ fontSize:"0.6rem", color:th.textMuted, letterSpacing:"0.15em", fontStyle:"normal", verticalAlign:"top", marginLeft:4 }}>LIVE</span>
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {weather && (
                  <div style={{ display:"flex", alignItems:"center", gap:"0.25rem", fontSize:"0.875rem", color:th.textBody }}>
                    <span>{weather.icon}</span>
                    <span style={{ fontWeight: "bold" }}>{weather.temp}°</span>
                  </div>
                )}
                <button onClick={()=>setNight(!night)} style={{ display:"flex", alignItems:"center", justifyContent:"center", background:th.bgInput, border:`1px solid ${th.border}`, width:"2.5rem", height:"2.5rem", borderRadius:"50%", color:th.textHead, cursor:"pointer" }}>
                  <span style={{ fontSize:"1.25rem" }}>{night?"🌕":"☀️"}</span>
                </button>
              </div>
            </div>
            <div style={{ width: "100%", position: "relative", display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position:"absolute", left:"1rem", top:"50%", transform:"translateY(-50%)", color:th.textMuted, fontSize:"0.875rem" }}>⌕</span>
                <input type="text" placeholder="Search..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{ width:"100%", padding:"0.75rem 1rem 0.75rem 2.5rem", borderRadius:8, background:th.bgInput, border:`1px solid ${th.border}`, color:th.textBody, fontSize:"1rem", outline:"none" }} />
              </div>
              <button onClick={() => setActivePage("about")} style={{ background: "transparent", color: th.textHead, border: "none", fontWeight: "bold", textTransform: "uppercase", fontSize: "0.75rem", cursor: "pointer", letterSpacing: "0.05em" }}>Subscribe</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
              <h1 onClick={() => setActivePage("home")} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontFamily:"'Playfair Display', serif", fontWeight:900, fontSize:"1.5rem", color:th.textHead, margin:0, letterSpacing:"-0.03em", textTransform: "uppercase" }}>
                <img src="/favicon.svg" alt="Logo" style={{ width: 32, height: 32, borderRadius: 6 }} />
                THE NEWS HUB <span style={{ fontSize:"0.6rem", color:th.textMuted, letterSpacing:"0.15em", fontStyle:"normal", verticalAlign:"top", marginLeft:4 }}>LIVE</span>
              </h1>
              {weather && (
                <div style={{ display:"flex", alignItems:"center", gap:"0.25rem", fontSize:"0.875rem", color:th.textBody, borderLeft: `1px solid ${th.border}`, paddingLeft: "2rem" }}>
                  <span>{weather.icon}</span>
                  <span style={{ fontWeight: "bold" }}>{weather.temp}°</span>
                </div>
              )}
            </div>
            <div style={{ flex:1, display:"flex", justifyContent:"center", padding:"0 2rem" }}>
              <div style={{ width: "100%", maxWidth: 480, position: "relative" }}>
                <span style={{ position:"absolute", left:"1rem", top:"50%", transform:"translateY(-50%)", color:th.textMuted, fontSize:"0.875rem" }}>⌕</span>
                <input type="text" placeholder="Search..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{ width:"100%", padding:"0.6rem 1rem 0.6rem 2.5rem", borderRadius:8, background:th.bgInput, border:`1px solid ${th.border}`, color:th.textBody, fontSize:"0.875rem", outline:"none" }} />
              </div>
            </div>
            <div style={{ display:"flex", gap:"1.5rem", alignItems:"center" }}>
              <button onClick={() => setActivePage("about")} style={{ background: "transparent", color: th.textHead, border: "none", fontWeight: "bold", textTransform: "uppercase", fontSize: "0.75rem", cursor: "pointer", letterSpacing: "0.05em" }}>Subscribe</button>
              <div style={{ fontSize:"0.5625rem", letterSpacing:"0.15em", textTransform:"uppercase", color:th.textMuted, textAlign:"right", lineHeight:1.4 }}>
                UPDATED<br/>
                {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
              <button onClick={()=>setNight(!night)} style={{ display:"flex", alignItems:"center", gap:"0.5rem", background:th.bgInput, border:`1px solid ${th.border}`, padding:"0.4rem 1rem", borderRadius:9999, color:th.textHead, fontSize:"0.625rem", cursor:"pointer", textTransform:"uppercase", fontWeight:"bold", letterSpacing:"0.1em" }}>
                <span style={{ fontSize:"0.875rem" }}>{night?"🌕":"☀️"}</span>
                <span>{night?"NIGHT":"DAY"}</span>
              </button>
            </div>
          </>
        )}
      </header>

      {activePage === "home" ? (
        <>
          {/* CATEGORIES NAV */}
          <div style={{ width: "100%", borderBottom:`1px solid ${th.border}`, padding: isMobile ? "0 1rem" : "0 2rem", overflowX:"auto", scrollbarWidth:"none", display:"flex", justifyContent: isMobile ? "flex-start" : "center" }}>
        <div style={{ flexShrink: 0, display:"flex", gap: isMobile ? "1rem" : "2rem" }}>
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button 
                key={cat.id} 
                onClick={()=>{setActiveCategory(cat.id); setSubTab(null); setActivePage("home");}} 
                style={{ 
                  background:"transparent", border:"none", 
                  color: isActive ? th.textHead : th.textMuted, 
                  borderBottom: isActive ? `2px solid ${th.accent}` : "2px solid transparent", 
                  cursor:"pointer", textTransform:"uppercase", fontSize:"0.75rem", 
                  fontWeight: isActive ? 800 : 600, padding:"1rem 0", display:"flex", 
                  alignItems:"center", gap:"0.5rem", whiteSpace:"nowrap", letterSpacing:"0.05em",
                  transition: "color 0.2s"
                }}
              >
                <span style={{ fontSize:"1rem" }}>{cat.icon}</span>
                {cat.short} {isActive && cat.id==="vibe" && <span style={{fontSize:"0.6rem"}}>✨</span>}
                {isActive && cat.id==="live" && <span style={{width:6, height:6, background:"red", borderRadius:"50%"}}></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-CATEGORIES NAV */}
      {(activeCategory === "live" || activeCategory === "vibe" || activeCategory === "world") && (
        <div style={{ width:"100%", display:"flex", justifyContent: isMobile ? "flex-start" : "center", padding: isMobile ? "1rem" : "1.25rem 2rem", borderBottom:`1px solid ${th.border}`, overflowX:"auto", scrollbarWidth:"none" }}>
          <div style={{ flexShrink: 0, display:"flex", gap:"1rem", paddingRight: isMobile ? "2rem" : "0" }}>
            {(activeCategory === "live" ? MEDIA_SECTIONS : activeCategory === "world" ? WORLD_REGIONS : VIBE_SECTIONS).map(sub => (
              <button 
                key={sub.id} 
                onClick={()=>setSubTab(sub.id)} 
                style={{ 
                  background: subTab===sub.id ? (activeCategory==="vibe"?"rgba(16,185,129,0.1)":"rgba(245,197,80,0.1)") : "transparent", 
                  border:`1px solid ${subTab===sub.id ? (activeCategory==="vibe"?"#10b981":th.accent) : th.border}`, 
                  borderRadius:9999, padding:"0.5rem 1.25rem", 
                  color: subTab===sub.id ? (activeCategory==="vibe"?"#10b981":th.accent) : th.textMuted, 
                  fontSize:"0.75rem", fontWeight:600, cursor:"pointer", transition:"all 0.2s" 
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SUB-HEADER LABEL (Vibe, Media, or World) */}
      {!loading && !error && activePage === "home" && (
        <div style={{ padding: isMobile ? "1rem 1rem 0" : "1.5rem 2rem 0", display:"flex", alignItems:"center", gap:"0.5rem", flexWrap: "wrap" }}>
          <h2 style={{ fontSize:"1.25rem", fontWeight:800, margin:0, display:"flex", alignItems:"center", color:th.textHead }}>
             {(activeCategory === "vibe" || activeCategory === "live" || activeCategory === "world") && subTab 
                ? (activeCategory==="live"?MEDIA_SECTIONS:activeCategory==="world"?WORLD_REGIONS:VIBE_SECTIONS).find(s=>s.id===subTab)?.label 
                : CATEGORIES.find(c => c.id === activeCategory)?.label}
          </h2>
          <span style={{ fontSize:"0.875rem", color: th.textMuted, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", gap: "0.5rem" }}>
             <span style={{ opacity: 0.5 }}>-</span>
             {activeCategory === "live" ? (
               subTab === "radio" ? `${filteredRadio.length} stations` :
               subTab === "podcasts" ? `${filteredPodcasts.length} podcasts` :
               `${filteredVideos.length} videos`
             ) : (
               `${filteredArticles.length} stories · ${videos.length || 0} videos`
             )}
          </span>
          {(activeCategory === "vibe" || activeCategory === "live") && subTab && (
            <span style={{ marginLeft: "1rem", fontSize:"0.625rem", padding:"0.25rem 0.5rem", border:`1px solid ${activeCategory==="vibe"?"rgba(16,185,129,0.3)":"rgba(220,38,38,0.3)"}`, borderRadius:4, color:activeCategory==="vibe"?"#10b981":"#dc2626", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:"bold", background:activeCategory==="vibe"?"rgba(16,185,129,0.1)":"rgba(220,38,38,0.1)" }}>
               {activeCategory==="vibe" ? "Good Vibes" : (subTab==="radio" ? "• ON AIR" : (subTab==="video"?"• LIVE":"🎙 AUDIO"))}
            </span>
          )}
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main style={{ padding: isMobile ? "1rem" : "2rem", maxWidth: 1400, margin: "0 auto", width: "100%", paddingBottom: audioItem ? (isMobile ? "120px" : "100px") : (isMobile ? "1rem" : "2rem") }}>
        {loading ? (
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))", gap: isMobile ? "1rem" : "2rem" }}>
            <SkeletonCard th={th}/>
            <SkeletonCard th={th}/>
            <SkeletonCard th={th}/>
          </div>
        ) : error ? (
          <div style={{ padding:"4rem", textAlign:"center", color:th.textMuted }}>
            <div style={{ fontSize:"3rem", marginBottom:"1rem" }}>⚠️</div>
            <p>Error loading content: {error}</p>
          </div>
        ) : (
          <div style={{ 
            display:"grid", 
            gridTemplateColumns: isMobile ? "1fr" : (activeCategory==="live" && subTab==="radio" ? "repeat(auto-fill, minmax(300px, 1fr))" 
              : activeCategory==="live" && subTab==="podcasts" ? "repeat(auto-fill, minmax(400px, 1fr))"
              : "repeat(auto-fill, minmax(360px, 1fr))"), 
            gap: isMobile ? "1rem" : "2rem" 
          }}>
            {activeCategory === "live" ? (
               subTab === "video" ? filteredVideos.map((v:any,i:number) => <VideoCard key={i} video={v} onPlay={(mode:string) => mode==="choose" ? setChoiceItem({type:"video", item:v}) : mode==="browser" ? window.open(v.url) : setReaderItem({type:"video", item:v})} th={th} />) :
               subTab === "podcasts" ? filteredPodcasts.map((p:any,i:number) => <PodcastCard key={i} podcast={p} onPlay={(mode:string) => mode==="browser" ? window.open(p.mp3) : setAudioItem(p)} th={th} />) :
               filteredRadio.map((r:any,i:number) => <RadioCard key={i} radio={r} onPlay={(mode:string) => mode==="browser" ? window.open(r.url) : setAudioItem(r)} th={th} />)
            ) : (
               <>
                 {featured && <NewsCard activeCategory={activeCategory} article={featured} featured onRead={(mode:string) => mode==="browser" ? window.open(featured.url) : setReaderItem({type:"article", item:featured})} th={th} bookmarks={bookmarks} onBookmark={toggleBookmark} />}
                 {mixed.map((a: any,i: number) => (
                   <React.Fragment key={`${a.id || 'article'}-${i}`}>
                     <NewsCard activeCategory={activeCategory} article={a} onRead={(mode:string) => mode==="browser" ? window.open(a.url) : setReaderItem({type:"article", item:a})} th={th} bookmarks={bookmarks} onBookmark={toggleBookmark} />
                     {(i + 1) % 4 === 0 && <AdUnit format="fluid" lang={subTab || "en"} style={{ gridColumn: isMobile ? "span 1" : "auto" }} />}
                   </React.Fragment>
                 ))}
               </>
            )}
          </div>
        )}
      </main>

      {/* ERITREA LISTEN LIVE STICKY */}
      {activeCategory === "world" && subTab === "eritrea" && (
        <div style={{ position: "fixed", bottom: isMobile ? 80 : 40, left: "50%", transform: "translateX(-50%)", zIndex: 50 }}>
          <button 
             onClick={() => setAudioItem(RADIO_STATIONS.find(r => r.id === "erena") || { id:"erena", name:"Eri-TV Live", country:"🇪🇷", genre:"Eritrea News", url:"https://jmc-live.ercdn.net/eritreatv/eritreatv.m3u8" })}
             style={{ background: "#C00000", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "1rem 2rem", borderRadius: 999, fontWeight: "bold", fontSize: "1rem", boxShadow: "0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.05em" }}
          >
            <span className="live-pulse" style={{ fontSize: "1.2rem" }}>🔴</span> LISTEN: ERI-TV LIVE
          </button>
        </div>
      )}
      </>
      ) : (
        <StaticPage page={activePage} th={th} />
      )}

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${th.border}`, padding: "2rem", textAlign: "center", fontSize: "0.875rem", color: th.textMuted, marginTop: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginBottom: "1rem", flexWrap: "wrap", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "bold" }}>
          <button onClick={() => setActivePage("about")} style={{ background: "none", border: "none", color: activePage === "about" ? th.textHead : th.textMuted, cursor: "pointer" }}>About</button>
          <button onClick={() => setActivePage("contact")} style={{ background: "none", border: "none", color: activePage === "contact" ? th.textHead : th.textMuted, cursor: "pointer" }}>Contact</button>
          <button onClick={() => setActivePage("privacy")} style={{ background: "none", border: "none", color: activePage === "privacy" ? th.textHead : th.textMuted, cursor: "pointer" }}>Privacy Policy</button>
        </div>
        <p style={{ fontFamily: "monospace" }}>&copy; {new Date().getFullYear()} TheNewsHub. Built for readability.</p>
      </footer>

      {/* MODAL / READER */}
      {choiceItem && (
        <div 
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }} 
          onClick={() => setChoiceItem(null)}
        >
          <div 
            style={{ background: th.bgCard, width: "100%", maxWidth: 400, borderRadius: 12, padding: "2rem", border: `1px solid ${th.border}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", textAlign: "center" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.25rem", color: th.textHead, marginBottom: "1rem", marginTop: 0 }}>Play Video</h3>
            <p style={{ color: th.textBody, marginBottom: "2rem", fontSize: "0.875rem" }}>Would you like to watch this video here or open YouTube in a new tab?</p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexDirection: isMobile ? "column" : "row" }}>
              <button 
                onClick={() => { setReaderItem(choiceItem); setChoiceItem(null); }}
                style={{ background: th.accentBg, color: th.accent, border: `1px solid ${th.accent}`, padding: "0.75rem 1.5rem", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
              >
                Play In-App
              </button>
              <button 
                onClick={() => { window.open(choiceItem.item.url, "_blank"); setChoiceItem(null); }}
                style={{ background: th.bgInput, color: th.textHead, border: `1px solid ${th.border}`, padding: "0.75rem 1.5rem", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
              >
                Browser ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {readerItem && (
        <div 
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "0" : "2rem", overscrollBehavior: "none", touchAction: "none" }} 
          onClick={() => setReaderItem(null)}
        >
          <div 
            style={{ 
               background: th.bg, 
               width: "100%", 
               maxWidth: readerItem.type === 'video' ? 1000 : 800, 
               ...(isMobile ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 } : { height: "100%", maxHeight: "90vh", borderRadius: 12, position: "relative" }),
               overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${th.border}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", touchAction: "auto"
            }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: isMobile ? "1rem" : "1rem 1.5rem", borderBottom: `1px solid ${th.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: th.bgHeader, flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: isMobile ? "1rem" : "1.125rem", color: th.textHead, fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: "0.5rem" }}>
                 {readerItem.item.title || readerItem.item.name}
              </h3>
              <div style={{ display: "flex", gap: isMobile ? "0.5rem" : "1rem", alignItems: "center" }}>
                <button onClick={() => {
                  const url = readerItem.item.url || readerItem.item.mp3;
                  if (url) window.open(url, "_blank");
                }} style={{ background: th.bgInput, border: `1px solid ${th.border}`, color: th.textHead, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", padding: "0.4rem 0.75rem", borderRadius: 6, fontWeight: "bold" }}>
                  <span style={{ display: isMobile ? "none" : "inline" }}>↗ OPEN IN BROWSER</span>
                  <span style={{ display: isMobile ? "inline" : "none" }}>↗ OPEN</span>
                </button>
                <button onClick={() => setReaderItem(null)} style={{ background: "transparent", border: "none", color: th.textMuted, cursor: "pointer", fontSize: "1.75rem", lineHeight: 1, padding: "0 0.25rem" }}>&times;</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", position: "relative", minHeight: 0 }}>
              {readerItem.type === 'video' && (
                <iframe src={`https://www.youtube.com/embed/${readerItem.item.videoId || readerItem.item.id.replace(/^yt-/, '').replace(/^yt:video:/, '')}?autoplay=1`} style={{ width: "100%", height: "100%", border: "none" }} allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
              )}
              {readerItem.type === 'article' && (
                <ArticleReader article={readerItem.item} th={th} isMobile={isMobile} />
              )}
            </div>
          </div>
        </div>
      )}

      {audioItem && (
        <AudioPlayerBar item={audioItem} th={th} isMobile={isMobile} onClose={() => setAudioItem(null)} />
      )}
    </div>
  );
}
