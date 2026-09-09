// Full world snapshots repeat many field names. Compress larger frames at low CPU cost.
// No shared compression history is retained between messages or connections.
export const AUTHORITY_TRANSPORT_OPTIONS = Object.freeze({
  perMessageDeflate: {
    threshold: 2048,
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    zlibDeflateOptions: { level: 1 },
  },
});
