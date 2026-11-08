import "./landing-page.css";

const roles = [
  { number: "01", title: "Residents", description: "Stay connected to your estate, manage service charges, generate visitor access codes and track maintenance requests.", icon: "⌂" },
  { number: "02", title: "Security teams", description: "Verify visitor QR codes at the gate, review visit details and manage entry with confidence.", icon: "◈" },
  { number: "03", title: "Event organisers", description: "Plan estate events, manage guest lists, send invitations and keep check-in organised.", icon: "▦" },
  { number: "04", title: "Facility managers", description: "Oversee properties, residents, payments, maintenance and day-to-day estate operations.", icon: "▤" },
];

const features = [
  { title: "Visitor access", description: "Create and verify secure visitor passes, with a clear record of arrivals.", icon: "⌑" },
  { title: "Payments & service charges", description: "Keep charges, contributions and payment history organised in one place.", icon: "₦" },
  { title: "Maintenance requests", description: "Raise issues, follow progress and reopen a request when more attention is needed.", icon: "⚒" },
  { title: "Events & invitations", description: "Coordinate guest lists, invitations and event-day attendance.", icon: "▦" },
  { title: "Estate communications", description: "Share important updates and reach residents with relevant announcements.", icon: "◌" },
  { title: "Reports & oversight", description: "Give estate teams and platform administrators a clearer view of operations.", icon: "⌁" },
];

export default function LandingPage() {
  return (
    <main className="cb-landing">
      <header className="cb-header">
        <a className="cb-brand" href="/" aria-label="CB Nest home">
          <span className="cb-brand-mark">⌂</span>
          <span>CB NEST<small>COMMUNITY & ESTATE MANAGEMENT</small></span>
        </a>
        <nav className="cb-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a><a href="#who-its-for">Who it’s for</a><a href="#features">Features</a>
        </nav>
        <a className="cb-login-link" href="/login">Management sign in <span>↗</span></a>
      </header>

      <section className="cb-hero">
        <div className="cb-hero-copy">
          <div className="cb-eyebrow"><span /> SMARTER ESTATE LIVING STARTS HERE</div>
          <h1>Better managed<br />communities.<br /><em>Better everyday living.</em></h1>
          <p className="cb-hero-text">CB Nest brings residents, security teams, event organisers and estate managers together on one connected platform — making everyday estate operations simpler, clearer and more secure.</p>
          <div className="cb-hero-actions">
            <a className="cb-button cb-button-gold" href="/login">Access management portal <span>→</span></a>
            <a className="cb-text-link" href="#platform">Explore the platform <span>↓</span></a>
          </div>
          <div className="cb-hero-note"><span className="cb-note-icon">✓</span> One connected experience for your entire estate</div>
        </div>

        <div className="cb-hero-visual" aria-label="Illustration of the CB Nest estate management dashboard">
          <div className="cb-visual-glow" />
          <div className="cb-dashboard-card">
            <div className="cb-dash-top"><div className="cb-mini-brand"><span>⌂</span> CB NEST</div><span className="cb-live"><i /> ESTATE OVERVIEW</span></div>
            <div className="cb-dash-welcome"><div><small>GOOD MORNING</small><h3>Your estate at a glance.</h3><p>Everything connected. Everything in view.</p></div><div className="cb-dash-avatar">FM</div></div>
            <div className="cb-dash-stats">
              <div><span className="cb-stat-icon">⌂</span><small>PROPERTIES</small><strong>248</strong><em>Estate units</em></div>
              <div><span className="cb-stat-icon">♙</span><small>RESIDENTS</small><strong>186</strong><em>Active accounts</em></div>
              <div><span className="cb-stat-icon">◈</span><small>VISITORS TODAY</small><strong>32</strong><em>Gate check-ins</em></div>
            </div>
            <div className="cb-dash-bottom"><div><div className="cb-dash-section-title">ESTATE ACTIVITY <span>THIS WEEK</span></div><div className="cb-bars"><i style={{height:"36%"}}/><i style={{height:"56%"}}/><i style={{height:"43%"}}/><i style={{height:"76%"}}/><i style={{height:"61%"}}/><i style={{height:"91%"}}/><i style={{height:"70%"}}/></div><div className="cb-days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div></div><div className="cb-activity"><span className="cb-activity-dot" /><div><b>Visitor verified</b><small>Gate access recorded</small></div></div></div>
          </div>
          <div className="cb-float-card cb-float-one"><span>✓</span><div><b>Access verified</b><small>Visitor check-in</small></div></div>
          <div className="cb-float-card cb-float-two"><span>₦</span><div><b>Payments tracked</b><small>Clear payment records</small></div></div>
          <div className="cb-visual-caption">A clearer view of your community</div>
        </div>
        <div className="cb-hero-orb cb-orb-one" /><div className="cb-hero-orb cb-orb-two" />
      </section>

      <section className="cb-trust-strip" id="platform">
        <span>ONE PLATFORM</span><i /><span>CONNECTED ROLES</span><i /><span>SIMPLER OPERATIONS</span><i /><span>BETTER VISIBILITY</span>
      </section>

      <section className="cb-section cb-intro">
        <div className="cb-section-kicker">THE CB NEST PLATFORM</div>
        <div className="cb-intro-grid"><h2>Estate management,<br /><em>working as one.</em></h2><p>From the gate to the management office, CB Nest helps every part of a community stay in sync. Less fragmented communication. More visibility. A smoother experience for the people who live and work there.</p></div>
      </section>

      <section className="cb-section cb-roles" id="who-its-for">
        <div className="cb-section-heading"><div><div className="cb-section-kicker">BUILT AROUND YOUR COMMUNITY</div><h2>One community.<br /><em>Every role connected.</em></h2></div><p>Each person gets tools designed around what they need to do — without clutter or unnecessary complexity.</p></div>
        <div className="cb-role-grid">{roles.map((role)=><article className="cb-role-card" key={role.title}><div className="cb-role-card-top"><span className="cb-role-icon">{role.icon}</span><small>{role.number}</small></div><h3>{role.title}</h3><p>{role.description}</p><span className="cb-card-line" /></article>)}</div>
      </section>

      <section className="cb-feature-band" id="features">
        <div className="cb-section cb-feature-inner">
          <div className="cb-feature-heading"><div className="cb-section-kicker">EVERYDAY ESTATE OPERATIONS</div><h2>The tools to keep<br /><em>things moving.</em></h2><p>Bring essential estate services into one practical, connected experience.</p><a className="cb-button cb-button-outline" href="/login">Go to management portal <span>→</span></a></div>
          <div className="cb-feature-grid">{features.map((feature)=><article className="cb-feature" key={feature.title}><span className="cb-feature-icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
        </div>
      </section>

      <section className="cb-closing">
        <div className="cb-closing-mark">⌂</div><div className="cb-section-kicker">WELCOME TO A BETTER WAY TO MANAGE</div><h2>Your community.<br /><em>Connected by CB Nest.</em></h2><p>Ready to access your estate management workspace?</p><a className="cb-button cb-button-gold" href="/login">Sign in to the management portal <span>→</span></a>
      </section>

      <footer className="cb-footer"><a className="cb-brand" href="/"><span className="cb-brand-mark">⌂</span><span>CB NEST<small>COMMUNITY & ESTATE MANAGEMENT</small></span></a><span>© {new Date().getFullYear()} CB Nest. All rights reserved.</span><a href="/login">Management sign in ↗</a></footer>
    </main>
  );
}
