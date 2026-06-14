"use client";

import { useEffect, useState } from "react";

/**
 * Live agent-identity panel (issue #159, Fix 1). Replaces the hardcoded Agent
 * Identity block on the service-detail page with data fetched from
 * GET /api/ens/agent, surfacing the ENSIP-25/26 compliant process-server agent's
 * live ENS profile — avatar, description, url, and credential status — alongside
 * the static ENS name / address / doc links the previous block already showed.
 */
interface AgentResponse {
  ensName: string | null;
  agentENSName: string;
  agentAddress: string | null;
  agentHasENSIdentity: boolean;
  ensip25Compliant: boolean;
  ensip26Compliant: boolean;
  textRecords: { avatar?: string; url?: string; description?: string };
  credentials: Record<string, string>;
  ensipLinks: { agentRegistry: string; agentTextRecords: string };
}

const AGENT_ENS = "youhavebeenserved.eth";
const AGENT_AVATAR = `https://metadata.ens.domains/mainnet/avatar/${AGENT_ENS}`;

export function AgentIdentity() {
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/ens/agent");
        const data: AgentResponse = await res.json();
        if (active) setAgent(data);
      } catch {
        // Network/agent failure must not break the page — fall back to the
        // static identity rendered from the constants below.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const agentAddress = agent?.agentAddress ?? "0xd116A147A95f406a4A4F589c44d588cfE58ef6E0";
  const description = agent?.textRecords?.description;
  const url = agent?.textRecords?.url;
  const ensip26Compliant = agent?.ensip26Compliant ?? false;

  return (
    <section
      className={`rounded-lg border border-blue-500/30 bg-blue-950/20 p-4 ${
        loading ? "animate-pulse opacity-50" : ""
      }`}
    >
      <h3 className="mb-3 text-sm font-semibold text-blue-400">🤖 Agent Identity (ENSIP-25)</h3>

      <div className="mb-3 flex items-start gap-3">
        {avatarFailed ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            YS
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={AGENT_AVATAR}
            alt="youhavebeenserved.eth avatar"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
            onError={() => setAvatarFailed(true)}
          />
        )}
        <div className="flex flex-col gap-1">
          {description ? <p className="text-sm text-gray-300">{description}</p> : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline"
            >
              {url} ↗
            </a>
          ) : null}
          <span
            className={`mt-0.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              ensip26Compliant
                ? "bg-green-500/20 text-green-400"
                : "bg-gray-500/20 text-gray-400"
            }`}
          >
            {ensip26Compliant ? "ENSIP-26 ✓" : "ENSIP-26 pending"}
          </span>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Process Server Agent</span>
          <a
            href="https://app.ens.domains/youhavebeenserved.eth"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-blue-400 hover:underline"
          >
            youhavebeenserved.eth ↗
          </a>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Agent Address</span>
          <span className="break-all font-mono text-xs text-gray-300">{agentAddress}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Standard</span>
          <div className="flex gap-2">
            <a
              href="https://docs.ens.domains/ensip/25/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline"
            >
              ENSIP-25 ↗
            </a>
            <a
              href="https://docs.ens.domains/ensip/26/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline"
            >
              ENSIP-26 ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
