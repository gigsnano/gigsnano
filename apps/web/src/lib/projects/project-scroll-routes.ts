/**
 * Which project sub-routes own their inner scroll instead of growing the page.
 *
 * A route belongs here when it is an app shell rather than a document: it sizes
 * something to the viewport (a canvas, a virtualised table) or pins a control to
 * the bottom of a bounded column (a chat composer). Everything else scrolls as a
 * page, which is the better default for reading.
 */
export function projectRouteManagesOwnScroll(pathname: string): boolean {
  return (
    // Work-item detail + the work-item list (virtualised layouts).
    /\/projects\/[^/]+\/issues(\/[^/]+)?$/.test(pathname) ||
    // The Sigma canvas needs a fixed-size container to size its WebGL surface.
    /\/projects\/[^/]+\/codebase$/.test(pathname) ||
    // The journey STEP workspace: three columns, the middle one an agent chat whose
    // composer must stay pinned to the column's bottom (GIN-476). `/journey` and
    // `/journey/discovery` are ordinary documents and keep the page scroll.
    /\/projects\/[^/]+\/journey\/(?!discovery$)[^/]+$/.test(pathname) ||
    // A single meeting: header + status stepper stay pinned while only the
    // live transcript scrolls (F3). The meetings list itself is an ordinary
    // document and keeps the page scroll.
    /\/projects\/[^/]+\/meetings\/[^/]+$/.test(pathname)
  );
}
