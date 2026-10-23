import { load as loadJson } from './verify-node-json-loader-20261007.mjs';
// Test-only loader: never open a connection to the real database.
export async function load(url, context, nextLoad) {
  if (url.endsWith('/server/database.js')) return {format:'module',shortCircuit:true,source:`
    const deny=()=>{globalThis.__testDatabaseCalls=(globalThis.__testDatabaseCalls||0)+1;throw Error('Forbidden database access in endless test');};
    export const db={get:deny,all:deny,run:deny,exec:deny};
    export const withTransaction=deny;
  `};
  return loadJson(url,context,nextLoad);
}
