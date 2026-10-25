/** Inline script run before first paint — keep in sync with `panel.store` persist shape. */
export const PANEL_INIT_SCRIPT = `try{var s=(JSON.parse(localStorage.getItem('gn.panel')||'{}').state)||{};var d=document.documentElement;if(typeof s.width==='number')d.style.setProperty('--panel-w',s.width+'px');d.setAttribute('data-panel-collapsed',s.collapsed?'true':'false');}catch(e){}`;
