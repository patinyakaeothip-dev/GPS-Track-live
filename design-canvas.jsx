
// DesignCanvas.jsx — Figma-ish design canvas wrapper (used by dashboard.html's
// design-canvas gallery view; not required by the production runner/results/
// monitor/admin pages). Warm gray grid bg + Sections + Artboards.

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

const DCCtx = React.createContext(null);

function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, (c) => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));
    else out.push(c);
  });
  return out;
}

function DesignCanvas({ children, style }) {
  const api = React.useMemo(() => ({ setFocus: () => {} }), []);
  return (
    <DCCtx.Provider value={api}>
      <div
        style={{
          minHeight: '100vh', width: '100%',
          background: DC.bg, overflow: 'auto',
          position: 'relative', fontFamily: DC.font,
          boxSizing: 'border-box', padding: '60px 0 80px',
          ...style,
        }}
      >
        {children}
      </div>
    </DCCtx.Provider>
  );
}

function DCSection({ id, title, subtitle, children, gap = 48 }) {
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter((c) => c && c.type === DCArtboard);
  const rest = all.filter((c) => !(c && c.type === DCArtboard));
  return (
    <div data-dc-section={id} style={{ marginBottom: 80, position: 'relative' }}>
      <div style={{ padding: '0 60px' }}>
        <div style={{ paddingBottom: 36 }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: DC.title, letterSpacing: -0.4, marginBottom: 6 }}>
            {title}
          </div>
          {subtitle && <div style={{ fontSize: 16, color: DC.subtitle }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap, padding: '0 60px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {artboards.map((ab, i) => (
          <DCArtboardFrame key={ab.props.id ?? ab.props.label ?? i} artboard={ab} />
        ))}
      </div>
      {rest}
    </div>
  );
}

function DCArtboard() { return null; }

function DCArtboardFrame({ artboard }) {
  const { id, label, width = 260, height = 480, children, style = {} } = artboard.props;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 500, color: DC.label }}>
        {label ?? id}
      </div>
      <div style={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
        overflow: 'hidden', width, height, background: '#fff', ...style }}>
        {children || (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#bbb', fontSize: 13, fontFamily: DC.font }}>{id}</div>
        )}
      </div>
    </div>
  );
}

function DCPostIt({ children, top, left, right, bottom, rotate = -2, width = 180 }) {
  return (
    <div style={{
      position: 'absolute', top, left, right, bottom, width,
      background: '#fef4a8', padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14, lineHeight: 1.4, color: '#5a4a2a',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5,
    }}>{children}</div>
  );
}

Object.assign(window, { DesignCanvas, DCSection, DCArtboard, DCPostIt });
