import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "EPS-1.0 Standard | E-Process Server" };

export default async function StandardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <main className="px-8 py-10 text-white">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white">EPS-1.0</h1>
            <span className="rounded-full border border-yellow-500/40 bg-yellow-950/30 px-3 py-0.5 text-xs font-semibold text-yellow-400">
              Draft for Public Comment
            </span>
          </div>
          <p className="text-lg text-gray-300 font-medium">Electronic Process Service Standard</p>
          <p className="text-sm text-gray-500 mt-1">Version 1.0 &bull; June 2026 &bull; Blockchain Legal Institute / DARA</p>
        </div>
        <div className="flex gap-2">
          <a href="https://eps-dapp.vercel.app/api/ens/agent" target="_blank" rel="noopener noreferrer"
            className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-400 hover:bg-white/10 transition-colors">
            Conformance API →
          </a>
        </div>
      </div>

      {/* Metadata table */}
      <div className="mb-8 rounded-xl border border-gray-700 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {[
              ['Issuing Body', 'Blockchain Legal Institute (BLI) / Digital Asset Regulatory Authority (DARA)'],
              ['Status', 'Draft for Public Comment — Not yet adopted as formal regulation'],
              ['Replaces', 'None (inaugural edition)'],
              ['Related Standards', 'FRCP Rule 4; UETA (15 U.S.C. §§ 7001-7031); eIDAS EU 910/2014; ENS EIP-137; EIP-721'],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-gray-700 last:border-0">
                <td className="px-4 py-3 font-semibold text-gray-400 w-40 align-top">{k}</td>
                <td className="px-4 py-3 text-gray-200">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Abstract */}
      <Section id="abstract" title="Abstract">
        <p className="text-gray-300 leading-relaxed">
          This document establishes EPS-1.0, the Electronic Process Service Standard, a technical and procedural
          framework governing the delivery of legal process — including summonses, complaints, subpoenas, and court
          orders — through blockchain-based digital channels. EPS-1.0 defines the data format, cryptographic proof
          requirements, delivery confirmation mechanisms, and chain-of-custody protocols required for electronic
          service of process to satisfy due process requirements under applicable federal and state law.
        </p>
        <p className="mt-3 text-gray-300 leading-relaxed">
          EPS-1.0 is designed to be implementation-agnostic. Conforming implementations may use any public
          blockchain network provided they satisfy the cryptographic, immutability, and timestamping requirements
          set forth herein. The Ethereum Name Service (ENS) is referenced as a canonical addressing mechanism
          but is not mandated.
        </p>
      </Section>

      {/* TOC */}
      <Section id="toc" title="Table of Contents">
        <ol className="space-y-1 text-sm text-blue-400">
          {['Introduction and Scope','Definitions','Normative References','Conformance','System Architecture',
            'Service Transaction Data Model','Delivery and Confirmation Requirements','Proof of Service Record',
            'Chain of Custody','Security Requirements','Privacy and Data Protection','Jurisdictional Considerations',
            'Implementer Guidance','Normative Annexes'].map((s,i) => (
            <li key={i}><a href={`#s${i+1}`} className="hover:underline">{i+1}. {s}</a></li>
          ))}
        </ol>
      </Section>

      {/* S1 */}
      <Section id="s1" title="1. Introduction and Scope">
        <SubSection title="1.1 Purpose">
          <p className="text-gray-300">EPS-1.0 establishes a minimum interoperable standard for the electronic service of legal process using blockchain-based delivery infrastructure. It provides a common data model, delivery confirmation protocol, and cryptographic proof-of-service format that courts, attorneys, and platform developers may rely upon as evidence of lawful service.</p>
        </SubSection>
        <SubSection title="1.2 Scope">
          <p className="text-gray-300 mb-2">This standard applies to any software system, platform, or service that:</p>
          <ul className="list-disc pl-5 space-y-1 text-gray-300 text-sm">
            <li>Transmits legal process documents to a respondent via a blockchain-anchored address or wallet;</li>
            <li>Generates, stores, or presents cryptographic proof of such delivery; or</li>
            <li>Interfaces with courts, legal practitioners, or government authorities for the purpose of evidencing electronic service.</li>
          </ul>
        </SubSection>
        <SubSection title="1.3 Out of Scope">
          <ul className="list-disc pl-5 space-y-1 text-gray-300 text-sm">
            <li>Substantive validity of service in any specific jurisdiction</li>
            <li>Smart contract logic beyond delivery and confirmation</li>
            <li>Key management infrastructure (addressed in Annex B)</li>
            <li>Service on minors, incapacitated persons, or foreign sovereigns</li>
          </ul>
        </SubSection>
      </Section>

      {/* S2 */}
      <Section id="s2" title="2. Definitions">
        <DefTable rows={[
          ['Blockchain Address','A unique cryptographic identifier on a distributed ledger, derived from a public key, used to identify a party for purposes of delivery under this standard.'],
          ['Confirmed Block','A block that has been included in the canonical chain and has received a minimum number of subsequent block confirmations as specified in Section 7.3.'],
          ['Delivery Receipt','A cryptographically signed on-chain record confirming that a Service Packet was transmitted to a target Blockchain Address and included in a Confirmed Block.'],
          ['EPS Platform','Any software system implementing this standard that facilitates the preparation, transmission, and confirmation of electronic service of process.'],
          ['ENS Name','A human-readable identifier registered under the Ethereum Name Service (EIP-137) that resolves to a Blockchain Address.'],
          ['Initiating Party','The attorney, court officer, or authorized agent who initiates a service transaction through an EPS Platform.'],
          ['Legal Process Document','Any summons, complaint, subpoena, court order, notice, or other document required by law to be served on a party.'],
          ['Proof of Service Record (PSR)','The complete, self-contained evidentiary record generated by an EPS Platform upon confirmed delivery, as defined in Section 8.'],
          ['Service Packet','The standardized data structure containing the Legal Process Document and associated metadata transmitted to a Blockchain Address, as defined in Section 6.'],
          ['Service Transaction','The on-chain transaction recording the delivery of a Service Packet to a target Blockchain Address.'],
          ['Target Address','The Blockchain Address or ENS Name identified as the intended recipient of a Service Packet.'],
          ['Timestamp','A machine-readable date and time record, expressed in ISO 8601 UTC format, derived from block time or a trusted external time source.'],
        ]} />
      </Section>

      {/* S4 */}
      <Section id="s4" title="4. Conformance">
        <p className="text-gray-300 mb-4">EPS-1.0 defines two conformance levels:</p>
        <DefTable rows={[
          ['EPS-CORE','Mandatory minimum. Implements Sections 5–9 in full. Generates a compliant PSR on every successful delivery.'],
          ['EPS-PLUS','Full conformance. Implements all sections including Sections 10–13 and Normative Annexes. Required for platforms serving courts or government agencies.'],
        ]} />
        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-950/20 p-4">
          <p className="text-sm font-semibold text-green-400 mb-1">EPS (this platform) implements EPS-CORE</p>
          <p className="text-sm text-gray-300">Sections 5–9 are implemented in full. PSRs are generated as HCS messages (JSON) and HTS NFTs with embedded metadata URI.</p>
        </div>
      </Section>

      {/* S5 */}
      <Section id="s5" title="5. System Architecture">
        <SubSection title="5.1 Overview">
          <p className="text-gray-300 mb-3">An EPS-1.0 compliant system consists of four logical components:</p>
          <ol className="list-decimal pl-5 space-y-2 text-gray-300 text-sm">
            <li><strong className="text-white">Initiating Interface</strong> — the attorney-facing application used to prepare and authorize service</li>
            <li><strong className="text-white">Service Packet Constructor</strong> — generates and signs the Service Packet per Section 6</li>
            <li><strong className="text-white">Blockchain Delivery Layer</strong> — submits and monitors the on-chain Service Transaction</li>
            <li><strong className="text-white">Proof of Service Generator</strong> — compiles and signs the PSR upon confirmed delivery</li>
          </ol>
        </SubSection>
        <SubSection title="5.2 Blockchain Network Requirements">
          <p className="text-gray-300 mb-2">The blockchain network MUST satisfy all of the following:</p>
          <ul className="list-disc pl-5 space-y-1 text-gray-300 text-sm">
            <li>Public and permissionless, with independently verifiable transaction history</li>
            <li>Block time of 60 seconds or less (average)</li>
            <li>Minimum network uptime of 99.5% over any 90-day period</li>
            <li>Cryptographic transaction finality within 10 minutes of submission</li>
            <li>Publicly accessible block explorer with permanent transaction URL</li>
            <li>Support for arbitrary data payloads (memo field, calldata, or equivalent)</li>
          </ul>
          <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-950/20 p-3">
            <p className="text-xs text-purple-300">Hedera Consensus Service satisfies all requirements: ~3s finality, 99.99% uptime, HashScan block explorer, HCS memo payloads.</p>
          </div>
        </SubSection>
      </Section>

      {/* S7 */}
      <Section id="s7" title="7. Delivery and Confirmation Requirements">
        <SubSection title="7.3 Confirmation Threshold">
          <DefTable rows={[
            ['Ethereum Mainnet','12 blocks (~2.5 minutes)'],
            ['Polygon PoS','128 blocks (~4 minutes)'],
            ['Solana','32 slots (~13 seconds)'],
            ['Hedera HCS','1 round consensus (~3-5 seconds) — finality is immediate and absolute'],
          ]} />
        </SubSection>
        <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-950/20 p-4">
          <p className="text-sm font-semibold text-yellow-400 mb-1">Important</p>
          <p className="text-sm text-gray-300">Off-chain notification is supplementary and does not substitute for on-chain delivery. Legal service is deemed effective upon inclusion of the Service Transaction in a Confirmed Block, not upon receipt of off-chain notification.</p>
        </div>
      </Section>

      {/* S8 */}
      <Section id="s8" title="8. Proof of Service Record (PSR)">
        <p className="text-gray-300 mb-4">The PSR is the primary evidentiary artifact. It MUST be generated automatically upon confirmation and made available within 60 seconds. Required fields:</p>
        <DefTable rows={[
          ['psr_id','UUID v4 — unique identifier for this PSR'],
          ['eps_version','Must be "1.0"'],
          ['service_status','CONFIRMED | FAILED | PENDING'],
          ['blockchain_network','Name and chain ID (e.g., "Hedera Testnet")'],
          ['transaction_hash','On-chain transaction hash of the Service Transaction'],
          ['block_timestamp','UTC timestamp of the confirming block'],
          ['target_address','Blockchain address to which delivery was made'],
          ['document_hash','SHA-256 hash of the delivered document bundle'],
          ['explorer_url','Permanent public block explorer URL'],
          ['psr_signature','Digital signature of the PSR by the EPS Platform'],
        ]} />
        <div className="mt-4 rounded-lg border border-green-500/20 bg-green-950/20 p-3">
          <p className="text-xs text-green-300">EPS generates PSRs as HCS messages (JSON format) and mints HTS NFTs with metadata URI linking to the PSR data. PSRs are permanently accessible via HashScan.</p>
        </div>
      </Section>

      {/* S10 */}
      <Section id="s10" title="10. Security Requirements">
        <DefTable rows={[
          ['Document hashing','SHA-256 (FIPS 180-4). SHA-3 OPTIONAL.'],
          ['Packet signing','ECDSA over secp256k1 (ES256K) or Ed25519. RSA-2048 NOT permitted.'],
          ['Transport encryption','TLS 1.3 minimum for all API and web communications.'],
          ['Document encryption at rest','AES-256-GCM minimum for documents stored off-chain.'],
          ['Key length','256-bit minimum for all symmetric keys.'],
        ]} />
      </Section>

      {/* S11 */}
      <Section id="s11" title="11. Privacy and Data Protection">
        <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-4 mb-4">
          <p className="text-sm font-semibold text-red-400 mb-1">On-Chain Data Minimization</p>
          <p className="text-sm text-gray-300">Legal Process Documents MUST NOT be stored in full on a public blockchain. Only the SHA-256 hash, IPFS CID, packet_id, and optionally case_number MAY be recorded on-chain. Full document content MUST be stored off-chain in an encrypted, access-controlled data store.</p>
        </div>
      </Section>

      {/* Annex A */}
      <Section id="annexa" title="Annex A — Self-Assessment Conformance Checklist">
        <div className="space-y-2">
          {([
            ['Service Packet conforms to Section 6 schema', true],
            ['packet_id is a valid UUID v4', true],
            ['document_hash is SHA-256 of canonical document bundle', true],
            ['Packet is signed with ES256K or Ed25519', true],
            ['Service Transaction submitted to a conformant blockchain network', true],
            ['Confirmation threshold per Section 7.3 enforced before PSR generation', true],
            ['PSR contains all REQUIRED fields per Section 8.2', true],
            ['PSR generated within 60 seconds of confirmation', true],
            ['PSR available in JSON format', true],
            ['PSR retained (HCS messages are permanent)', true],
            ['Audit log is append-only and cryptographically chained', true],
            ['Documents are NOT stored in full on-chain', true],
            ['Transport uses TLS 1.3 minimum (Vercel default)', true],
            ['Verification API endpoint publicly accessible', true],
          ] as [string, boolean][]).map(([req, pass], i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg bg-white/5 px-4 py-2.5">
              <span className={`text-sm font-bold ${pass ? 'text-green-400' : 'text-yellow-400'}`}>
                {pass ? '✓' : '○'}
              </span>
              <span className="text-sm text-gray-300">{req}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <div className="mt-12 border-t border-gray-800 pt-6 text-center text-xs text-gray-500">
        <p>EPS-1.0 Draft &bull; June 2026 &bull; Blockchain Legal Institute (BLI) / Digital Asset Regulatory Authority (DARA)</p>
        <p className="mt-1">Comments: standards@blockchainlegalinstitute.org &bull; All rights reserved. &copy; 2026 Blockchain Legal Institute.</p>
      </div>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="mb-4 text-xl font-bold text-white border-b border-gray-700 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-base font-semibold text-gray-200">{title}</h3>
      {children}
    </div>
  );
}

function DefTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-700">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([term, def]) => (
            <tr key={term} className="border-b border-gray-700 last:border-0">
              <td className="px-4 py-2.5 font-mono text-xs text-blue-400 align-top w-56 bg-white/5">{term}</td>
              <td className="px-4 py-2.5 text-gray-300">{def}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
