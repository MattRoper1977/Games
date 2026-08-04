#!/usr/bin/env node
'use strict';
// Compatibility entry point retained for the established Sports workflow.
// Apex Tennis is now the manifest authority for the four-game collection.
const path=require('path');
const {spawnSync}=require('child_process');
const verifier=path.join(__dirname,'verify_apextennis_manifest.js');
const result=spawnSync(process.execPath,[verifier,...process.argv.slice(2)],{stdio:'inherit',env:process.env});
process.exit(result.status===null?1:result.status);
