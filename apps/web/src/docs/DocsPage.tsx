import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Copy, ExternalLink, Menu, Search, X } from "lucide-react";
import { docGroups, docs, type DocBlock, type DocPage } from "./content";
import "./docs.css";

function DocLink({ item, className, children, onClick }: { item: DocPage; className?: string; children: React.ReactNode; onClick?: () => void }) {
  return <Link to="/docs/$slug" params={{ slug: item.slug }} className={className} onClick={onClick}>{children}</Link>;
}

function Flow({ items }: { items: string[] }) {
  return <div className="doc-flow" role="list" aria-label="Process diagram">{items.map((item, index) => <div className="doc-flow-row" role="listitem" key={`${item}-${index}`}><span className="doc-flow-index">{String(index + 1).padStart(2, "0")}</span><span>{item}</span>{index < items.length - 1 && <span className="doc-flow-line" aria-hidden="true" />}</div>)}</div>;
}

function Code({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }
  return <div className="doc-code"><div className="doc-code-bar"><span>REFERENCE / CONCEPTUAL</span><button type="button" onClick={copy} aria-label={copied ? "Copied" : "Copy code"}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div><pre><code>{value}</code></pre></div>;
}

function Section({ section, index }: { section: DocBlock; index: number }) {
  const id = `section-${index + 1}`;
  return <section className="doc-section" id={id}>
    <div className="doc-section-head"><span>{String(index + 1).padStart(2, "0")}</span><h2>{section.heading}</h2></div>
    <p>{section.body}</p>
    {section.flow && <Flow items={section.flow} />}
    {section.table && <div className="doc-table-scroll"><table><thead><tr>{section.table.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{section.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {section.points && <ul className="doc-points">{section.points.map(point => <li key={point}>{point}</li>)}</ul>}
    {section.code && <Code value={section.code} />}
    {section.note && <div className="doc-note"><strong>Implementation note</strong><p>{section.note}</p></div>}
  </section>;
}

export function DocsPage() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const slug = pathname.split("/")[2] || "overview";
  const matchedIndex = docs.findIndex(item => item.slug === slug);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;
  const current = docs[currentIndex];
  const demo = docs.find(item => item.slug === "demo-guide");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const matches = useMemo(() => docs.filter(item => `${item.title} ${item.summary} ${item.blocks.map(b => b.heading).join(" ")}`.toLowerCase().includes(query.toLowerCase())).slice(0, 10), [query]);
  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setTechnicalOpen(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") { setSearchOpen(false); setMenuOpen(false); } }
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, []);
  if (!current) return null;
  const previous = currentIndex > 0 ? docs[currentIndex - 1] : undefined;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : undefined;
  return <div className="docs-root">
    <a className="doc-skip" href="#doc-main">Skip to content</a>
    <header className="doc-header"><button className="doc-mobile-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle documentation navigation" aria-expanded={menuOpen}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button><Link to="/docs" className="doc-brand"><span className="doc-brand-mark">H<span>.</span></span><span><strong>HOUSEHOLD<br />INTELLIGENCE</strong><small>PROJECT DOCUMENTATION</small></span></Link><span className="doc-header-rule" /><span className="doc-header-meta">Engineering dossier <span> / </span> 2026</span><button type="button" className="doc-search-button" onClick={() => setSearchOpen(true)}><Search size={17} /><span>Search documentation</span><kbd>⌘ K</kbd></button><Link className="doc-app-link" to="/">Open app <ExternalLink size={14} /></Link></header>
    <aside className={`doc-sidebar ${menuOpen ? "is-open" : ""}`} aria-label="Documentation sections"><div className="doc-sidebar-inner"><div className="doc-sidebar-label">CONTENTS <span>{docs.length} ARTICLES</span></div>{docGroups.map(group => <div className="doc-nav-group" key={group}><div className="doc-nav-group-title">{group}</div>{docs.filter(item => item.group === group).map(item => <DocLink key={item.slug} item={item} onClick={() => setMenuOpen(false)} className={`doc-nav-link ${item.slug === current.slug ? "active" : ""}`}><span>{item.title}</span><span className="doc-nav-arrow">↗</span></DocLink>)}</div>)}<div className="doc-sidebar-footer"><BookOpen size={17} /><span>Built for independent review.<br />Every claim has a boundary.</span></div></div></aside>
    <main className="doc-main" id="doc-main"><div className="doc-main-inner"><div className="doc-breadcrumb"><Link to="/docs">Documentation</Link><span>/</span><span>{current.group}</span><span>/</span><strong>{current.title}</strong></div><div className="doc-article-top"><div className="doc-kicker"><span className="doc-kicker-line" />{current.eyebrow}<span className="doc-article-number">{String(currentIndex + 1).padStart(2, "0")} / {docs.length}</span></div><h1>{current.title}</h1><p className="doc-lede">{current.summary}</p></div><div className="doc-status-strip"><span className="doc-status-dot" /> PROJECT REFERENCE <span className="doc-strip-divider" /> CURRENT + PROPOSED, LABELED IN CONTEXT</div><div className="doc-article-layout"><article className="doc-article"><div className="doc-intro"><span>THE ESSENTIAL POINT</span><p>{current.takeaway}</p></div>{current.blocks.map((section, i) => <Section section={section} index={i} key={section.heading} />)}<div className="doc-why"><span>WHY THIS MATTERS</span><p>{current.takeaway}</p></div><details className="doc-details" open={technicalOpen} onToggle={event => setTechnicalOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>Reading this as a judge <ChevronDown size={17} /></summary><p>Use the sidebar to follow the argument from product problem to architecture, then inspect the demo guide and implementation limits. Terms such as current, planned and conceptual refer to the checked-in prototype rather than a verified production deployment.</p></details><div className="doc-judge"><span>JUDGE TAKEAWAY</span><p>{current.takeaway}</p></div><nav className="doc-pagination" aria-label="Previous and next documentation pages">{previous ? <DocLink item={previous} className="doc-page-nav"><small><ArrowLeft size={14} /> PREVIOUS</small><strong>{previous.title}</strong></DocLink> : <span />}{next ? <DocLink item={next} className="doc-page-nav next"><small>NEXT <ArrowRight size={14} /></small><strong>{next.title}</strong></DocLink> : <span />}</nav><footer className="doc-footer">HOUSEHOLD INTELLIGENCE <span>·</span> A living intelligence layer for the household.</footer></article><aside className="doc-toc" aria-label="On this page"><div className="doc-toc-title">ON THIS PAGE</div>{current.blocks.map((section, index) => <a href={`#section-${index + 1}`} key={section.heading}>{section.heading}</a>)}<div className="doc-toc-rule" />{demo && <DocLink item={demo} className="doc-toc-demo">View demo guide <ArrowRight size={15} /></DocLink>}</aside></div></div></main>
    {searchOpen && <div className="doc-search-backdrop" onClick={() => setSearchOpen(false)}><div role="dialog" aria-modal="true" aria-label="Search documentation" className="doc-search-dialog" onClick={event => event.stopPropagation()}><div className="doc-search-input-wrap"><Search size={19} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search topics, concepts, APIs..." /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={18} /></button></div><div className="doc-search-results"><span>{query ? `${matches.length} RESULTS` : "QUICK NAVIGATION"}</span>{matches.length ? matches.map(item => <DocLink item={item} key={item.slug} className="doc-search-result" onClick={() => setSearchOpen(false)}><span><strong>{item.title}</strong><small>{item.summary}</small></span><ArrowRight size={16} /></DocLink>) : <p>No documentation pages match that search.</p>}</div></div></div>}
  </div>;
}
