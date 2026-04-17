"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  fetchCasinoCatalogGames,
  fetchCasinoCatalogProviders,
  fetchGameProviderFlags,
  type GameProviderFlags,
} from "@/lib/playerGamesApi";
import { casinoCatalogKeyFromProviderTitle, isCasinoProviderVisible } from "@/lib/providerPolicyMap";

interface Provider {
  id: number;
  title: string;
  logo_url: string;
  lobby_game_id: number | null;
}

interface Game {
  id: number;
  provider_id: number;
  provider_name: string;
  game_name: string;
  game_code: string;
  plxmed_game_id: number;
  game_image: string;
  game_title: string;
  category: string;
  is_jackpot: boolean;
}

export default function CasinoPage() {
  const { token, openLogin } = usePlayerAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerFlags, setProviderFlags] = useState<GameProviderFlags | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingGames, setLoadingGames] = useState(false);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const LIMIT = 24;

  useEffect(() => {
    if (!token) {
      setProviders([]);
      setLoadingProviders(false);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 12_000);
    setLoadingProviders(true);
    fetchCasinoCatalogProviders(token, "Live+Casino", { signal: ac.signal })
      .then((d) => {
        if (!ac.signal.aborted) setProviders(Array.isArray(d?.data) ? (d.data as Provider[]) : []);
      })
      .catch(() => {
        if (!ac.signal.aborted) setProviders([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          window.clearTimeout(t);
          setLoadingProviders(false);
        }
      });
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setProviderFlags(null);
      return;
    }
    let cancelled = false;
    void fetchGameProviderFlags(token)
      .then((f) => {
        if (!cancelled) setProviderFlags(f);
      })
      .catch(() => {
        if (!cancelled) setProviderFlags(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const visibleProviders = useMemo(
    () => providers.filter((p) => isCasinoProviderVisible(providerFlags, p.title)),
    [providers, providerFlags],
  );

  const loadGames = async (provider: Provider, p = 1) => {
    if (!token) {
      openLogin();
      return;
    }
    setLoadingGames(true);
    setPage(p);
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 15_000);
    try {
      const d = await fetchCasinoCatalogGames(token, {
        provider_id: provider.id,
        category: "Live+Casino",
        page: p,
        limit: LIMIT,
        signal: ac.signal,
      });
      if (!ac.signal.aborted) {
        setGames(Array.isArray(d?.data) ? (d.data as Game[]) : []);
        setTotal(typeof d?.total === "number" ? d.total : 0);
      }
    } catch {
      if (!ac.signal.aborted) {
        setGames([]);
        setTotal(0);
      }
    } finally {
      window.clearTimeout(to);
      if (!ac.signal.aborted) setLoadingGames(false);
    }
  };

  const handleProviderClick = (p: Provider) => {
    // lobby_game_id가 있으면 게임 목록 없이 바로 로비 실행
    if (p.lobby_game_id) {
      void handleGameClick(p.lobby_game_id, p.title);
      return;
    }
    setSelectedProvider(p);
    loadGames(p, 1);
  };

  const handleGameClick = async (gameId: number, providerTitle?: string) => {
    /* 런치는 JWT만 필요. user 미갱신·일시 null이어도 토큰 있으면 진행(로비형 게임사 클릭 시 오동작 방지) */
    if (!token) {
      openLogin();
      return;
    }
    const pk = providerTitle ? casinoCatalogKeyFromProviderTitle(providerTitle) : null;
    try {
      const r = await fetch(`/gp-api/api/player/games/casino/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          lang: "KO",
          game_kind: "casino",
          ...(pk ? { provider_key: pk } : {}),
        }),
      });
      if (r.status === 401) {
        openLogin();
        return;
      }
      const d = await r.json();
      if (r.status === 403) {
        alert(typeof d?.detail === "string" ? d.detail : "이 게임사는 현재 이용할 수 없습니다.");
        return;
      }
      if (d.url) {
        setGameUrl(d.url);
      } else {
        alert(d.detail || d.message || "게임을 불러올 수 없습니다.");
      }
    } catch {
      alert("게임 연결에 실패했습니다. 네트워크를 확인하거나 잠시 후 다시 시도해 주세요.");
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* 게임 iframe 모달 */}
      {gameUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="relative w-[96vw] h-[92vh]">
            <button
              onClick={() => setGameUrl(null)}
              className="absolute -top-9 right-0 text-slate-400 hover:text-white text-sm font-bold px-3 py-1 rounded-lg border border-white/10 hover:border-white/30"
            >
              ✕ 닫기
            </button>
            <iframe
              ref={iframeRef}
              src={gameUrl}
              className="w-full h-full border-0"
              allowFullScreen
              onLoad={() => {
                // Evolution: /entry 로 세션 인증 후 /frontend/evo/r2/ 로비로 이동
                if (gameUrl.includes("evo-games.com/entry") && iframeRef.current) {
                  try {
                    const iframeUrl = iframeRef.current.contentWindow?.location.href || "";
                    if (iframeUrl.includes("evo-games.com") && !iframeUrl.includes("/frontend/evo/r2/")) {
                      const jsessionid = gameUrl.split("JSESSIONID=")[1]?.split("&")[0] || "";
                      const base = gameUrl.split("/entry")[0];
                      iframeRef.current.src = `${base}/frontend/evo/r2/?JSESSIONID=${jsessionid}`;
                    }
                  } catch {}
                }
              }}
            />
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        {/* 상단 탭 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← 홈</Link>
          <span className="text-slate-700">/</span>
          <span className="text-premium font-semibold">라이브카지노</span>
          <Link href="/slot" className="ml-auto text-sm text-slate-500 hover:text-premium-glow border border-white/10 rounded-lg px-3 py-1.5 hover:border-premium/30">
            슬롯게임 →
          </Link>
        </div>

        {/* 게임사 선택 화면 */}
        {!selectedProvider && (
          <>
            <div className="mb-6">
              <h1 className="font-display text-2xl font-semibold text-slate-100 sm:text-3xl">
                🎰 라이브카지노
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                로그인 후 목록이 gp-api를 통해 제공됩니다. 운영 설정에서 OFF 된 게임사는 표시되지 않습니다.
              </p>
            </div>

            {loadingProviders ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="glass-panel h-28 animate-pulse" />
                ))}
              </div>
            ) : visibleProviders.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-8 text-center text-sm text-slate-500">
                {!token
                  ? "게임사 목록을 보려면 로그인해 주세요."
                  : "표시할 라이브 카지노 게임사가 없습니다. 운영 설정의 게임사 제한을 확인하세요."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {visibleProviders.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderClick(p)}
                    className="glass-panel flex flex-col items-center justify-center gap-3 p-5 hover:border-premium/40 hover:shadow-premium transition-all duration-200 group"
                  >
                    {p.logo_url ? (
                      <img
                        src={p.logo_url}
                        alt={p.title}
                        className="h-10 w-auto object-contain opacity-80 group-hover:opacity-100 transition"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    ) : null}
                    <span className="text-xs font-medium text-slate-400 group-hover:text-premium-glow transition">
                      {p.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* 게임 목록 화면 */}
        {selectedProvider && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setSelectedProvider(null); setGames([]); }}
                className="text-sm text-slate-500 hover:text-slate-300 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20"
              >
                ← 뒤로
              </button>
              {selectedProvider.logo_url && (
                <img src={selectedProvider.logo_url} alt={selectedProvider.title} className="h-7 w-auto object-contain opacity-90" onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <h2 className="font-display text-xl font-semibold text-slate-100">
                {selectedProvider.title}
              </h2>
              <span className="text-xs text-slate-600">총 {total}개</span>
            </div>

            {loadingGames ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] rounded-xl bg-slate-900/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {games.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => void handleGameClick(g.plxmed_game_id, selectedProvider?.title)}
                      className="group relative overflow-hidden rounded-xl border border-white/5 bg-slate-950/40 text-left transition hover:border-premium/30 hover:shadow-premium"
                    >
                      <div className="aspect-[4/3] overflow-hidden">
                        <img
                          src={g.game_image}
                          alt={g.game_title || g.game_name}
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.src = "";
                            e.currentTarget.parentElement!.className = "aspect-[4/3] bg-slate-900 flex items-center justify-center";
                          }}
                          loading="lazy"
                        />
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] font-medium text-slate-300 truncate">
                          {g.game_title || g.game_name}
                        </p>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition">
                        <span className="rounded-full bg-gradient-to-r from-premium to-yellow-300 px-4 py-1.5 text-xs font-bold text-slate-900">
                          ▶ PLAY
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* 페이징 */}
                {totalPages > 1 && (
                  <div className="mt-6 flex justify-center gap-2">
                    {page > 1 && (
                      <button onClick={() => loadGames(selectedProvider, page - 1)}
                        className="px-3 py-1.5 rounded-lg border border-white/10 text-sm text-slate-400 hover:border-premium/30 hover:text-premium-glow">
                        ‹
                      </button>
                    )}
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <button key={p} onClick={() => loadGames(selectedProvider, p)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${p === page ? "border-premium bg-premium/20 text-premium-glow" : "border-white/10 text-slate-400 hover:border-premium/30 hover:text-premium-glow"}`}>
                          {p}
                        </button>
                      );
                    })}
                    {page < totalPages && (
                      <button onClick={() => loadGames(selectedProvider, page + 1)}
                        className="px-3 py-1.5 rounded-lg border border-white/10 text-sm text-slate-400 hover:border-premium/30 hover:text-premium-glow">
                        ›
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <footer className="mt-auto border-t border-white/5 py-6 text-center text-[11px] text-slate-600">
        © SLOTPASS · 라이브카지노
      </footer>
    </div>
  );
}
