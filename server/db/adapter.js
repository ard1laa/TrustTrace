import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { ISSUER_DID, getIssuerDIDDocument, generateStudentWalletIdentity } from '../crypto/ecdsaEngine.js';
import { hashPassword } from '../services/auth.js';
import { publishChange } from '../services/events.js';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'trusttrace_db.json');
const LEGACY_JSON_DB_PATH = path.join(DATA_DIR, 'trusttrace-db.json');
const MAX_TX_LOGS = 500;
const DEMO_ACCOUNT_IDS = new Set(['demo-recruiter-global', 'demo-admin-registrar']);

// Documents keep their app-level string `id`; Mongo's _id stays internal.
// `strict: false` lets VC payloads and forensic reports round-trip untouched.
const schemaOptions = { strict: false, versionKey: false };

const UserSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true, required: true },
    name: String,
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: String,
    role: { type: String, enum: ['student', 'recruiter', 'admin'], default: 'student', index: true },
    accountStatus: { type: String, enum: ['verified', 'pending_verification', 'rejected'], default: 'verified', index: true },
    isDemo: Boolean,
    verificationProof: mongoose.Schema.Types.Mixed,
    verificationRequestedAt: String,
    verificationReviewedAt: String,
    verificationReviewedBy: String,
    verificationNote: String,
    authProviders: [{ provider: String, subject: String, linkedAt: String, _id: false }],
    avatarUrl: String,
    fieldOfStudy: String,
    studentId: String,
    university: String,
    program: String,
    headline: String,
    bio: String,
    location: String,
    visibleInTalentSearch: { type: Boolean, default: true },
    companyName: String,
    jobTitle: String,
    companyWebsite: String,
    companyRegId: String,
    departmentRole: String,
    did: { type: String, index: true },
    walletAddress: String,
    privateKeyHex: String,
    seedPhrase: String,
    publicKeyHex: String,
    createdAt: String
  },
  schemaOptions
);

const CredentialSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true, required: true },
    tokenId: { type: Number, index: true },
    studentUserId: { type: String, index: true },
    studentDid: String,
    studentName: String,
    achievementTitle: String,
    issuingOrganization: String,
    issuanceDate: String,
    competencyDomain: String,
    achievementType: String,
    requiresScoring: Boolean,
    achievementResult: String,
    attainedLevel: String,
    masteryScore: Number,
    state: { type: String, enum: ['Draft', 'Signed', 'Anchored', 'Locked', 'Revoked'], default: 'Locked', index: true },
    isPublic: { type: Boolean, default: true },
    credentialHash: { type: String, index: true },
    fileHash: String,
    ipfsCid: String,
    txHash: String,
    blockNumber: Number,
    verifiableCredential: mongoose.Schema.Types.Mixed,
    aiForensics: mongoose.Schema.Types.Mixed,
    revocationReason: String,
    createdAt: String
  },
  schemaOptions
);

const TxLogSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true, required: true },
    txHash: String,
    blockNumber: { type: Number, index: true },
    event: String,
    method: String,
    tokenId: Number,
    holderSoul: String,
    ipfsCid: String,
    credentialHash: String,
    timestamp: String
  },
  schemaOptions
);

// Singleton document for ledger counters, registries and recruiter shortlists.
const SystemStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'system' },
    meta: mongoose.Schema.Types.Mixed,
    didRegistry: mongoose.Schema.Types.Mixed,
    logoRegistry: mongoose.Schema.Types.Mixed,
    recruiterShortlists: mongoose.Schema.Types.Mixed
  },
  schemaOptions
);

export function createDefaultLogoRegistry() {
  return [
    {
      id: 'reg-crest-uni',
      name: 'Official University Crest & Seal',
      issuerEntity: 'Global Institute of Technology',
      ruleType: 'Vector Emblem & Institutional Seal Match',
      minConfidenceThreshold: 80,
      active: true,
      updatedAt: '2026-10-01T08:00:00Z'
    },
    {
      id: 'reg-club-faculty',
      name: 'Authorized Faculty & Student Organization Stamps',
      issuerEntity: 'Academic Faculties & Accredited Student Societies',
      ruleType: 'Official Stamp & Advisor Counter-Signature',
      minConfidenceThreshold: 80,
      active: true,
      updatedAt: '2026-10-05T08:00:00Z'
    },
    {
      id: 'reg-sig-registrar',
      name: 'Registrar ECDSA & Document Geometry Rules',
      issuerEntity: 'Office of the Registrar',
      ruleType: 'Document Geometry & Metadata Integrity',
      minConfidenceThreshold: 80,
      active: true,
      updatedAt: '2026-10-10T08:00:00Z'
    }
  ];
}

// Fresh install: no students, no certificates, two demo accounts.
function createInitialState() {
  const demoRecruiter = {
    id: 'demo-recruiter-global',
    name: 'Alex Morgan',
    email: 'recruiter@company.com',
    passwordHash: hashPassword('recruiter123'),
    role: 'recruiter',
    isDemo: true,
    accountStatus: 'verified',
    authProviders: [],
    avatarUrl: '',
    companyName: 'Global Tech Corp',
    jobTitle: 'Talent Acquisition',
    companyWebsite: 'https://company.example',
    companyRegId: 'CORP-2026-8841',
    headline: 'Talent Acquisition at Global Tech Corp',
    bio: 'Verifies candidate credentials for Global Tech Corp.',
    location: 'Remote',
    ...generateStudentWalletIdentity('recruiter@company.com', 'CORP-2026-8841'),
    createdAt: '2026-10-01T08:00:00Z'
  };

  const demoAdmin = {
    id: 'demo-admin-registrar',
    name: 'Dr. Sam Rivera',
    email: 'registrar@university.edu',
    passwordHash: hashPassword('admin123'),
    role: 'admin',
    isDemo: true,
    accountStatus: 'verified',
    authProviders: [],
    avatarUrl: '',
    university: 'Global Institute of Technology',
    departmentRole: 'Office of the Registrar',
    studentId: 'REG-UNI-001',
    headline: 'Credential Issuer · Office of the Registrar',
    bio: 'Issues and approves co-curricular micro-credentials.',
    location: 'Remote',
    did: ISSUER_DID,
    walletAddress: '0x99887766554433221100fedcba98765432100001',
    publicKeyHex: getIssuerDIDDocument().verificationMethod[0].publicKeyHex,
    createdAt: '2026-10-01T08:00:00Z'
  };

  return {
    meta: {
      version: '4.0.0',
      nextTokenId: 1001,
      nextBlockNumber: 48210,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      chainId: 1337,
      consensus: 'Hyperledger Besu IBFT 2.0 Proof-of-Authority (0 Gas Fee)'
    },
    didRegistry: [getIssuerDIDDocument()],
    logoRegistry: createDefaultLogoRegistry(),
    recruiterShortlists: {},
    users: [demoRecruiter, demoAdmin],
    credentials: [],
    txLogs: [
      {
        id: 'tx-genesis-48209',
        txHash: '0x' + crypto.createHash('sha256').update('genesis-trusttrace-ibft').digest('hex'),
        blockNumber: 48209,
        event: 'DIDDocumentRegistered (Genesis)',
        method: 'constructor(string,string,string)',
        tokenId: 0,
        holderSoul: demoAdmin.walletAddress,
        ipfsCid: 'GENESIS_DID_REGISTRY',
        credentialHash: '0x' + '0'.repeat(63) + '1',
        gasUsed: 0,
        gasPriceGwei: 0,
        consensus: 'IBFT 2.0 PoA (0 Gas)',
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function withDefaults(state) {
  state.meta ||= createInitialState().meta;
  state.didRegistry ||= [getIssuerDIDDocument()];
  state.logoRegistry ||= createDefaultLogoRegistry();
  state.recruiterShortlists ||= {};
  state.users ||= [];
  state.credentials ||= [];
  state.txLogs ||= [];
  for (const user of state.users) {
    user.authProviders ||= [];
    if (user.email) user.email = user.email.toLowerCase();
    // Accounts created before verification existed were already trusted.
    user.accountStatus ||= 'verified';
    if (DEMO_ACCOUNT_IDS.has(user.id)) user.isDemo = true;
  }
  return state;
}

function stripMongoFields(doc) {
  const { _id, __v, ...rest } = doc;
  return rest;
}

const byCreatedDesc = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

class TrustTraceDatabase {
  constructor() {
    this.mode = 'json';
    this.state = null;
    this.initialized = false;
    this.initPromise = null;
    this.models = null;
    this.snapshots = { users: new Map(), credentials: new Map(), txLogs: new Map(), system: '' };
    this.writeChain = Promise.resolve();
    this.lastLoadedAt = 0;
  }

  init() {
    if (this.initialized) {
      // Serverless instances don't share memory, so re-read the source of truth.
      if (this.mode === 'mongodb' && process.env.VERCEL && Date.now() - this.lastLoadedAt > 1500) {
        return this.loadFromMongo().catch(() => {});
      }
      return Promise.resolve();
    }
    this.initPromise ||= this.initialize();
    return this.initPromise;
  }

  async initialize() {
    const uri = process.env.MONGODB_URI?.trim();
    if (uri) {
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
        this.models = {
          User: mongoose.models.User || mongoose.model('User', UserSchema),
          Credential: mongoose.models.Credential || mongoose.model('Credential', CredentialSchema),
          TxLog: mongoose.models.TxLog || mongoose.model('TxLog', TxLogSchema),
          SystemState: mongoose.models.SystemState || mongoose.model('SystemState', SystemStateSchema)
        };
        this.mode = 'mongodb';
        const hasData = await this.loadFromMongo();
        if (!hasData) {
          // First boot against an empty cluster: migrate the local JSON store if present.
          this.state = this.readJsonFile() || createInitialState();
          await this.flushToMongo();
          console.log('[db] Seeded MongoDB from', this.readJsonFile() ? 'local JSON store' : 'clean initial state');
        }
        this.initialized = true;
        return;
      } catch (err) {
        console.error('[db] MongoDB unavailable, falling back to local JSON store:', err.message);
        this.mode = 'json';
        this.models = null;
      }
    }

    this.state = this.readJsonFile();
    if (!this.state) {
      this.state = createInitialState();
      this.writeJsonFile();
    }
    this.initialized = true;
  }

  async loadFromMongo() {
    const { User, Credential, TxLog, SystemState } = this.models;
    const [system, users, credentials, txLogs] = await Promise.all([
      SystemState.findById('system').lean(),
      User.find({}).lean(),
      Credential.find({}).lean(),
      TxLog.find({}).sort({ blockNumber: -1 }).limit(MAX_TX_LOGS).lean()
    ]);
    if (!system && users.length === 0) return false;

    this.state = withDefaults({
      meta: system?.meta,
      didRegistry: system?.didRegistry,
      logoRegistry: system?.logoRegistry,
      recruiterShortlists: system?.recruiterShortlists,
      users: users.map(stripMongoFields).sort(byCreatedDesc),
      credentials: credentials.map(stripMongoFields).sort(byCreatedDesc),
      txLogs: txLogs.map(stripMongoFields)
    });
    this.captureSnapshots();
    this.lastLoadedAt = Date.now();
    return true;
  }

  captureSnapshots() {
    for (const key of ['users', 'credentials', 'txLogs']) {
      this.snapshots[key] = new Map(this.state[key].map((d) => [d.id, JSON.stringify(d)]));
    }
    this.snapshots.system = JSON.stringify(this.systemDoc());
  }

  systemDoc() {
    const { meta, didRegistry, logoRegistry, recruiterShortlists } = this.state;
    return { meta, didRegistry, logoRegistry, recruiterShortlists };
  }

  // Writes only documents that changed since the last flush.
  async flushToMongo() {
    const { User, Credential, TxLog, SystemState } = this.models;
    const collections = [
      ['users', User],
      ['credentials', Credential],
      ['txLogs', TxLog]
    ];
    for (const [key, Model] of collections) {
      const previous = this.snapshots[key];
      const current = new Map(this.state[key].map((d) => [d.id, JSON.stringify(d)]));
      const ops = [];
      for (const [id, json] of current) {
        if (previous.get(id) !== json) {
          ops.push({ replaceOne: { filter: { id }, replacement: JSON.parse(json), upsert: true } });
        }
      }
      for (const id of previous.keys()) {
        if (!current.has(id)) ops.push({ deleteOne: { filter: { id } } });
      }
      if (ops.length) await Model.bulkWrite(ops, { ordered: false });
      this.snapshots[key] = current;
    }

    const system = JSON.stringify(this.systemDoc());
    if (system !== this.snapshots.system) {
      await SystemState.updateOne({ _id: 'system' }, { $set: JSON.parse(system) }, { upsert: true });
      this.snapshots.system = system;
    }
  }

  readJsonFile() {
    const candidates = [JSON_DB_PATH, LEGACY_JSON_DB_PATH].filter((p) => fs.existsSync(p));
    if (!candidates.length) return null;
    const newest = candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    try {
      return withDefaults(JSON.parse(fs.readFileSync(newest, 'utf-8')));
    } catch (err) {
      console.error('[db] Could not parse', newest, err.message);
      return null;
    }
  }

  writeJsonFile() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${JSON_DB_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tmp, JSON_DB_PATH);
    } catch (err) {
      console.error('[db] Failed to write JSON store:', err.message);
    }
  }

  // Persists the in-memory state and notifies connected clients.
  // Writes are serialized so concurrent requests can't interleave bulk ops.
  save(topics = ['data']) {
    if (this.state.txLogs.length > MAX_TX_LOGS) this.state.txLogs.length = MAX_TX_LOGS;

    if (this.mode === 'mongodb') {
      this.writeChain = this.writeChain
        .then(() => this.flushToMongo())
        .catch((err) => console.error('[db] MongoDB write failed:', err.message));
    } else {
      this.writeJsonFile();
    }
    publishChange(topics);
    return this.writeChain;
  }

  // Kept for existing call sites.
  saveToDisk() {
    return this.save();
  }

  async resetToInitialState() {
    this.state = createInitialState();
    await this.save();
  }

  findUserById(id) {
    return this.state?.users.find((u) => u.id === id) || null;
  }

  findUserByEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    return clean ? this.state.users.find((u) => u.email === clean) || null : null;
  }

  getStatus() {
    return {
      adapterMode: this.mode === 'mongodb' ? 'mongodb-atlas' : 'json-local',
      cloudConfigured: Boolean(process.env.MONGODB_URI),
      geminiVisionConfigured: Boolean(process.env.GEMINI_API_KEY),
      totalUsers: this.state?.users?.length || 0,
      totalStudents: (this.state?.users || []).filter((u) => u.role === 'student').length,
      totalCredentials: this.state?.credentials?.length || 0,
      totalAnchoredSBTs: (this.state?.credentials || []).filter((c) => c.state === 'Locked').length,
      contractAddress: this.state?.meta?.contractAddress,
      consensus: this.state?.meta?.consensus
    };
  }
}

export const db = new TrustTraceDatabase();
