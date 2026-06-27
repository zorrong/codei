import { useState } from 'react'
import {
  GitBranch,
  Zap,
  Shield,
  Globe,
  Search,
  Code2,
  MessageSquare,
  ArrowRight,
  Github,
  ChevronDown,
  ChevronUp,
  Terminal,
  FileJson,
  Brain,
  Layers,
  Rocket,
  Users,
  GitPullRequest,
  BookOpen,
  Check,
  X,
} from 'lucide-react'

function App() {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<{ context: string; tokens: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const handleQuery = async () => {
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxTokens: 3000 }),
      })

      if (!res.ok) throw new Error('Failed to query index')
      const data = await res.json()
      setResponse({ context: data.context, tokens: data.estimatedTokens })
    } catch {
      setError('Make sure codei server is running: codei serve . --port 3131')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleQuery()
    }
  }

  const faqs = [
    {
      q: "How is this different from GitHub Copilot or Cursor?",
      a: "Copilot and Cursor provide code completions. codei helps AI assistants understand your entire codebase context for better responses. It's complementary — use codei to give Claude/ChatGPT full project context.",
    },
    {
      q: "How is this different from vector embedding approaches (Pinecone, Chroma)?",
      a: "Vector embeddings use cosine similarity for search. codei uses LLM reasoning to traverse a hierarchical index. This means: deterministic results, no embedding drift, and ~100x less storage.",
    },
    {
      q: "Is my code stored externally?",
      a: "No. All index data stays local on your machine. The index is just JSON files describing your code structure — no actual code is sent anywhere.",
    },
    {
      q: "How often should I update the index?",
      a: "Run 'codei update' after significant changes, or use the git hook to auto-update after commits. For active development, weekly updates are usually sufficient.",
    },
    {
      q: "Which languages are supported?",
      a: "TypeScript, Python, Go, Rust, Java, C#, C++, PHP, Swift — and you can create adapters for any language using our adapter pattern.",
    },
    {
      q: "Can I self-host the server?",
      a: "Yes. The HTTP server runs entirely on your infrastructure. No cloud dependency required.",
    },
  ]

  const useCases = [
    {
      icon: <MessageSquare size={24} />,
      title: "AI Coding Assistants",
      description: "Give Claude, ChatGPT, or any LLM full project context. Instead of pasting files manually, let codei retrieve exactly what's relevant.",
    },
    {
      icon: <GitPullRequest size={24} />,
      title: "Code Review",
      description: "Analyze PRs with AI by providing relevant context. Ask 'what does this function do?' or 'how does this module work?'",
    },
    {
      icon: <Users size={24} />,
      title: "Developer Onboarding",
      description: "New developers can query 'how does X work?' and get instant, accurate context without reading thousands of lines.",
    },
    {
      icon: <BookOpen size={24} />,
      title: "Documentation",
      description: "Generate docs from code context. Ask 'what APIs does this service expose?' and get structured answers.",
    },
  ]

  const comparisons = [
    { feature: "Storage per file", codeindex: "~1 KB", vectors: "~100 KB" },
    { feature: "Query speed", codeindex: "~200ms", vectors: "~50ms" },
    { feature: "Accuracy", codeindex: "LLM reasoning", vectors: "Cosine similarity" },
    { feature: "Updates", codeindex: "Instant", vectors: "Re-embed required" },
    { feature: "Results", codeindex: "Deterministic", vectors: "May vary" },
    { feature: "External storage", codeindex: "None", vectors: "Required" },
    { feature: "Privacy", codeindex: "100% local", vectors: "Data leaves machine" },
  ]

  return (
    <div className="app">
      <nav className="navbar">
        <a href="#" className="logo">
          <svg className="logo-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="20" fill="#1a1a2e"/>
            <path d="M25 30 L50 20 L75 30 L75 70 L50 80 L25 70 Z" stroke="#4ade80" strokeWidth="3"/>
            <circle cx="50" cy="50" r="12" fill="#4ade80"/>
            <path d="M50 38 L50 20 M50 62 L50 80 M38 50 L25 50 M62 50 L75 50" stroke="#4ade80" strokeWidth="2"/>
          </svg>
          codei
        </a>
        <ul className="nav-links">
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#use-cases">Use Cases</a></li>
          <li><a href="#comparison">Comparison</a></li>
          <li><a href="#playground">Demo</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
      </nav>

      <section className="hero">
        <div className="hero-badges">
          <span className="hero-badge">
            <GitBranch size={14} /> Vectorless Architecture
          </span>
          <span className="hero-badge">
            <Shield size={14} /> Privacy First
          </span>
        </div>
        <div className="hero-content">
          <h1>
            <span className="gradient-text">Code Index</span> for AI Context Retrieval
          </h1>
          <p>
            Vectorless, reasoning-based code index. Reduce token usage from{' '}
            <strong>50,000+ tokens to ~1,000-3,000 tokens</strong> per query.
            Give your AI coding assistant exactly the context it needs.
          </p>
          <div className="cta-buttons">
            <a href="#playground" className="btn-primary">
              Try Demo <ArrowRight size={18} />
            </a>
            <a href="https://github.com/zorrong/codeindex" className="btn-secondary" target="_blank" rel="noopener noreferrer">
              <Github size={18} /> Star on GitHub
            </a>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <div className="stat-value">9</div>
              <div className="stat-label">Languages Supported</div>
            </div>
            <div className="stat">
              <div className="stat-value">~2KB</div>
              <div className="stat-label">Avg Query Response</div>
            </div>
            <div className="stat">
              <div className="stat-value">100x</div>
              <div className="stat-label">Less Storage</div>
            </div>
          </div>
        </div>
      </section>

      <section className="how-it-works" id="how-it-works">
        <div style={{ textAlign: 'center' }}>
          <h2>How It Works</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            Three simple steps to understand any codebase with AI
          </p>
        </div>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <div className="step-icon"><FileJson size={32} /></div>
            <h3>Index</h3>
            <p>Build a hierarchical tree index of your codebase. Extract symbols, dependencies, and summaries.</p>
            <div className="step-code">
              <Terminal size={14} /> <code>codei index .</code>
            </div>
          </div>
          <div className="step-arrow"><ArrowRight size={24} /></div>
          <div className="step-card">
            <div className="step-number">2</div>
            <div className="step-icon"><Brain size={32} /></div>
            <h3>Query</h3>
            <p>Ask questions in natural language. LLM reasoning traverses the tree to find relevant context.</p>
            <div className="step-code">
              <Terminal size={14} /> <code>codei query "..."</code>
            </div>
          </div>
          <div className="step-arrow"><ArrowRight size={24} /></div>
          <div className="step-card">
            <div className="step-number">3</div>
            <div className="step-icon"><Layers size={32} /></div>
            <h3>Context</h3>
            <p>Get exactly the code context you need. Paste into Claude, ChatGPT, or any AI assistant.</p>
            <div className="step-code">
              <Check size={14} color="var(--accent-primary)" /> ~2KB response
            </div>
          </div>
        </div>
        <div className="how-it-works-diagram">
          <div className="diagram-step">
            <span className="diagram-label">Your Query</span>
            <code>"How does auth work?"</code>
          </div>
          <ArrowRight size={20} className="diagram-arrow" />
          <div className="diagram-step">
            <span className="diagram-label">LLM Reasoning</span>
            <code>Selects relevant modules → files → symbols</code>
          </div>
          <ArrowRight size={20} className="diagram-arrow" />
          <div className="diagram-step">
            <span className="diagram-label">Response</span>
            <code>auth.service.ts + deps (2KB)</code>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div style={{ textAlign: 'center' }}>
          <h2>Why codei?</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            Unlike vector embedding approaches, codei uses LLM reasoning to traverse a hierarchical tree index.
          </p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <Zap className="feature-icon" />
            <h3>Token Efficient</h3>
            <p>Only relevant context is retrieved. No need to send the entire codebase to the LLM.</p>
          </div>
          <div className="feature-card">
            <GitBranch className="feature-icon" />
            <h3>Deterministic</h3>
            <p>Same query always returns the same result. No embedding drift over time.</p>
          </div>
          <div className="feature-card">
            <Shield className="feature-icon" />
            <h3>Privacy First</h3>
            <p>No vector embeddings stored externally. Your code stays private.</p>
          </div>
          <div className="feature-card">
            <Globe className="feature-icon" />
            <h3>Multi-Language</h3>
            <p>TypeScript, Python, Go, Rust, Java, C#, C++, PHP, Swift — and extensible.</p>
          </div>
          <div className="feature-card">
            <Search className="feature-icon" />
            <h3>Semantic Search</h3>
            <p>Uses LLM reasoning to understand intent, not just keywords.</p>
          </div>
          <div className="feature-card">
            <Code2 className="feature-icon" />
            <h3>IDE Integration</h3>
            <p>HTTP API for VSCode, JetBrains, Neovim, and other editors.</p>
          </div>
        </div>
      </section>

      <section className="use-cases" id="use-cases">
        <div style={{ textAlign: 'center' }}>
          <h2>Use Cases</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            From code completion to full project understanding
          </p>
        </div>
        <div className="use-cases-grid">
          {useCases.map((uc, i) => (
            <div key={i} className="use-case-card">
              <div className="use-case-icon">{uc.icon}</div>
              <h3>{uc.title}</h3>
              <p>{uc.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="comparison" id="comparison">
        <div style={{ textAlign: 'center' }}>
          <h2>vs Vector Embeddings</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            How does codei compare to traditional vector-based approaches?
          </p>
        </div>
        <div className="comparison-table">
          <div className="comparison-header">
            <div className="comparison-col">Feature</div>
            <div className="comparison-col codeindex-col">
              <span className="codeindex-badge">codei</span>
            </div>
            <div className="comparison-col">Vector Embeddings</div>
          </div>
          {comparisons.map((row, i) => (
            <div key={i} className="comparison-row">
              <div className="comparison-col feature-name">{row.feature}</div>
              <div className="comparison-col codeindex-value">
                <Check size={16} color="var(--accent-primary)" /> {row.codeindex}
              </div>
              <div className="comparison-col vector-value">
                <X size={16} color="#ef4444" /> {row.vectors}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="installation" id="installation">
        <div style={{ textAlign: 'center' }}>
          <h2>Get Started</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            Install and index your first project in under 2 minutes
          </p>
        </div>
        <div className="installation-steps">
          <div className="install-step">
            <div className="install-number">1</div>
            <div className="install-content">
              <h3>Install</h3>
              <div className="install-code">
                <Terminal size={16} />
                <code>npm install -g pnftrading_codei</code>
                <button onClick={() => navigator.clipboard.writeText('npm install -g pnftrading_codei')}>
                  Copy
                </button>
              </div>
            </div>
          </div>
          <div className="install-step">
            <div className="install-number">2</div>
            <div className="install-content">
              <h3>Setup API Key</h3>
              <div className="install-code">
                <Terminal size={16} />
                <code>codei setup</code>
              </div>
            </div>
          </div>
          <div className="install-step">
            <div className="install-number">3</div>
            <div className="install-content">
              <h3>Index Your Project</h3>
              <div className="install-code">
                <Terminal size={16} />
                <code>codei index .</code>
              </div>
            </div>
          </div>
          <div className="install-step">
            <div className="install-number">4</div>
            <div className="install-content">
              <h3>Query</h3>
              <div className="install-code">
                <Terminal size={16} />
                <code>codei query "How does auth work?"</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="playground" id="playground">
        <div className="playground-container">
          <h2>Live Demo</h2>
          <p className="playground-subtitle">
            Query your codebase with natural language. Start the server with{' '}
            <code style={{ color: 'var(--accent-primary)' }}>codei serve . --port 3131</code>
          </p>
          <div className="playground-ui">
            <div className="query-input-container">
              <textarea
                className="query-input"
                placeholder='Ask about your codebase... e.g. "How does authentication work?"'
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="query-button" onClick={handleQuery} disabled={loading || !query.trim()}>
                {loading ? (
                  <span className="loading">
                    <span className="spinner" /> Querying...
                  </span>
                ) : (
                  <>
                    <Search size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    Run Query
                  </>
                )}
              </button>
            </div>
            <div className="response-container">
              {error && (
                <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>
                  {error}
                </div>
              )}
              {response && (
                <div className="response-content">
                  <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Estimated tokens: {response.tokens}
                  </div>
                  {response.context}
                </div>
              )}
              {!response && !loading && !error && (
                <div className="response-placeholder">
                  <MessageSquare />
                  <p>Query results will appear here</p>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Press Ctrl+Enter to run
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="languages" id="languages">
        <div className="languages-container">
          <h2>Supported Languages</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Extensible adapter system for any programming language
          </p>
          <div className="languages-grid">
            {['TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'C++', 'PHP', 'Swift'].map((lang) => (
              <span key={lang} className="language-badge">{lang}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div style={{ textAlign: 'center' }}>
          <h2>FAQ</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            Frequently asked questions about codei
          </p>
        </div>
        <div className="faq-list">
          {faqs.map((faq, i) => (
            <div key={i} className="faq-item">
              <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span>{faq.q}</span>
                {openFaq === i ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              {openFaq === i && (
                <div className="faq-answer">
                  <p>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="sponsor">
        <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <h2>Support This Project</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            If codei saves you time and money, consider buying me a coffee ☕
            Every contribution helps keep this project alive and developing new features.
          </p>
          <a
            href="https://paypal.me/zorrong"
            className="btn-sponsor"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
            Donate via PayPal
          </a>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1rem' }}>
            PayPal: zorrong@outlook.com
          </p>
        </div>
      </section>

      <section className="cta">
        <h2>Ready to optimize your AI context retrieval?</h2>
        <p>Install codei and start building efficient AI-powered code understanding.</p>
        <div className="cta-buttons">
          <a href="https://github.com/zorrong/codeindex#installation" className="btn-primary" target="_blank" rel="noopener noreferrer">
            <Rocket size={18} /> Get Started
          </a>
          <a href="/docs/README.md" className="btn-secondary" target="_blank" rel="noopener noreferrer">
            Read Docs
          </a>
        </div>
      </section>

      <footer className="footer">
        <p>codei — Vectorless, reasoning-based code index for AI context retrieval.</p>
        <p style={{ marginTop: '0.5rem' }}>
          <a href="https://paypal.me/zorrong" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">
            ☕ Buy me a coffee
          </a>
          <span style={{ margin: '0 0.5rem' }}>•</span>
          MIT License
        </p>
      </footer>
    </div>
  )
}

export default App
