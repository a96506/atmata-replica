import {
  mutationAllowed,
  platformAccount,
  signInAccessToken,
  verifyRunId,
} from "./accounts";

export function requireMutation() {
  return mutationAllowed() && Boolean(verifyRunId());
}

type QueryResult = { data: unknown; error: { message: string } | null };

/** Minimal PostgREST + storage client via fetch (Playwright Node-safe). */
export async function sdkFor(email: string, password: string) {
  const { baseUrl, accessToken, anonKey: key } = await signInAccessToken(
    email,
    password,
  );

  function headers(extra?: HeadersInit): HeadersInit {
    return {
      Authorization: `Bearer ${accessToken}`,
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(extra ?? {}),
    };
  }

  function authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${accessToken}`,
      apikey: key,
    };
  }

  function from(table: string) {
    const state: {
      select?: string;
      filters: Array<[string, string]>;
      limit?: number;
      single?: boolean;
    } = { filters: [] };

    const run = async (): Promise<QueryResult> => {
      const params = new URLSearchParams();
      params.set("select", state.select ?? "*");
      for (const [column, value] of state.filters) {
        params.append(column, `eq.${value}`);
      }
      if (state.limit != null) params.set("limit", String(state.limit));
      const response = await fetch(
        `${baseUrl}/api/database/records/${encodeURIComponent(table)}?${params}`,
        { headers: headers() },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          data: null,
          error: {
            message:
              (body as { message?: string })?.message ??
              `HTTP ${response.status}`,
          },
        };
      }
      const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { data?: unknown })?.data)
          ? (body as { data: unknown[] }).data
          : body;
      if (state.single) {
        const row = Array.isArray(rows) ? (rows[0] ?? null) : rows;
        return { data: row, error: null };
      }
      return { data: rows, error: null };
    };

    const builder: {
      select: (projection?: string) => typeof builder;
      eq: (column: string, value: string | number | boolean) => typeof builder;
      limit: (n: number) => typeof builder;
      maybeSingle: () => Promise<QueryResult>;
      then: Promise<QueryResult>["then"];
    } = {
      select(projection = "*") {
        state.select = projection;
        return builder;
      },
      eq(column: string, value: string | number | boolean) {
        state.filters.push([column, String(value)]);
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      maybeSingle() {
        state.single = true;
        state.limit = 1;
        return run();
      },
      then(onfulfilled, onrejected) {
        return run().then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  async function rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<QueryResult> {
    const response = await fetch(
      `${baseUrl}/api/database/rpc/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(args),
        // InsForge edge can exceed default undici/axios 10s under write locks.
        signal: AbortSignal.timeout(45_000),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        data: null,
        error: {
          message:
            (body as { message?: string; error?: string })?.message ??
            (body as { error?: string })?.error ??
            `HTTP ${response.status}`,
        },
      };
    }
    return { data: (body as { data?: unknown })?.data ?? body, error: null };
  }

  const storage = {
    from(bucket: string) {
      return {
        async upload(objectKey: string, blob: Blob) {
          try {
            const strategyRes = await fetch(
              `${baseUrl}/api/storage/buckets/${encodeURIComponent(bucket)}/upload-strategy`,
              {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({
                  filename: objectKey,
                  contentType: blob.type || "application/octet-stream",
                  size: blob.size,
                }),
              },
            );
            const strategy = (await strategyRes.json().catch(() => null)) as {
              method?: string;
              uploadUrl?: string;
              fields?: Record<string, string>;
              confirmRequired?: boolean;
              confirmUrl?: string;
              key?: string;
              message?: string;
              error?: string;
            } | null;
            if (!strategyRes.ok) {
              return {
                data: null,
                error: {
                  message:
                    strategy?.message ??
                    strategy?.error ??
                    `upload-strategy HTTP ${strategyRes.status}`,
                },
              };
            }

            if (strategy?.method === "presigned" && strategy.uploadUrl) {
              const formData = new FormData();
              if (strategy.fields) {
                for (const [k, v] of Object.entries(strategy.fields)) {
                  formData.append(k, v);
                }
              }
              formData.append("file", blob);
              const uploadRes = await fetch(strategy.uploadUrl, {
                method: "POST",
                body: formData,
              });
              if (!uploadRes.ok) {
                return {
                  data: null,
                  error: {
                    message: `presigned upload HTTP ${uploadRes.status}`,
                  },
                };
              }
              if (strategy.confirmRequired && strategy.confirmUrl) {
                const confirmRes = await fetch(
                  strategy.confirmUrl.startsWith("http")
                    ? strategy.confirmUrl
                    : `${baseUrl}${strategy.confirmUrl}`,
                  {
                    method: "POST",
                    headers: headers(),
                    body: JSON.stringify({
                      size: blob.size,
                      contentType: blob.type || "application/octet-stream",
                    }),
                  },
                );
                if (!confirmRes.ok) {
                  return {
                    data: null,
                    error: {
                      message: `confirm upload HTTP ${confirmRes.status}`,
                    },
                  };
                }
              }
              return {
                data: { key: strategy.key ?? objectKey, bucket },
                error: null,
              };
            }

            if (strategy?.method === "direct") {
              const formData = new FormData();
              formData.append("file", blob);
              const uploadRes = await fetch(
                `${baseUrl}/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}`,
                {
                  method: "PUT",
                  headers: authHeaders(),
                  body: formData,
                },
              );
              const body = await uploadRes.json().catch(() => null);
              if (!uploadRes.ok) {
                return {
                  data: null,
                  error: {
                    message:
                      (body as { message?: string })?.message ??
                      `direct upload HTTP ${uploadRes.status}`,
                  },
                };
              }
              return {
                data: (body as { key?: string }) ?? { key: objectKey, bucket },
                error: null,
              };
            }

            return {
              data: null,
              error: {
                message: `unsupported upload method: ${strategy?.method ?? "unknown"}`,
              },
            };
          } catch (error) {
            return {
              data: null,
              error: {
                message:
                  error instanceof Error ? error.message : "upload failed",
              },
            };
          }
        },
        async download(objectKey: string) {
          try {
            const encoded = encodeURIComponent(objectKey);
            let strategyRes = await fetch(
              `${baseUrl}/api/storage/buckets/${encodeURIComponent(bucket)}/download-strategy/objects/${encoded}`,
              { headers: authHeaders() },
            );
            if (strategyRes.status === 404 || strategyRes.status === 405) {
              strategyRes = await fetch(
                `${baseUrl}/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encoded}/download-strategy`,
                {
                  method: "POST",
                  headers: headers(),
                  body: "{}",
                },
              );
            }
            if (!strategyRes.ok) {
              const body = await strategyRes.json().catch(() => null);
              return {
                data: null,
                error: {
                  message:
                    (body as { message?: string })?.message ??
                    `download-strategy HTTP ${strategyRes.status}`,
                },
              };
            }
            const strategy = (await strategyRes.json()) as {
              url?: string;
              method?: string;
            };
            if (!strategy.url) {
              return {
                data: null,
                error: { message: "download strategy missing url" },
              };
            }
            const downloadHeaders: HeadersInit =
              strategy.method === "direct" ? authHeaders() : {};
            const fileRes = await fetch(strategy.url, {
              headers: downloadHeaders,
            });
            if (!fileRes.ok) {
              return {
                data: null,
                error: { message: `download HTTP ${fileRes.status}` },
              };
            }
            return { data: await fileRes.blob(), error: null };
          } catch (error) {
            return {
              data: null,
              error: {
                message:
                  error instanceof Error ? error.message : "download failed",
              },
            };
          }
        },
      };
    },
  };

  return {
    database: { from, rpc },
    storage,
    accessToken,
    baseUrl,
  };
}

/** Load VERIFY-A curated product / tax / dates for write RPC probes. */
export async function loadVerifyAWriteContext(
  client: Awaited<ReturnType<typeof sdkFor>>,
) {
  const product = await client.database
    .from("products")
    .select("id,tax_code_id")
    .eq("sku", "VF-RM-01")
    .limit(1);
  const products = Array.isArray(product.data) ? product.data : [];
  const row = products[0] as { id?: string; tax_code_id?: string } | undefined;
  if (!row?.id) {
    return null;
  }
  const neededBy = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    productId: row.id,
    taxCodeId: row.tax_code_id ?? undefined,
    neededBy,
  };
}

export async function authedFetch(
  path: string,
  email: string,
  password: string,
  init?: RequestInit,
) {
  const { baseUrl, accessToken } = await signInAccessToken(email, password);
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function provisionVerifyCompany(label: "A" | "B") {
  const platform = platformAccount();
  const runId = verifyRunId();
  if (!platform || !runId) {
    throw new Error("platform credentials and VERIFY_RUN_ID required to provision");
  }
  const client = await sdkFor(platform.email, platform.password);
  const ownerEmail =
    label === "A"
      ? process.env.VERIFY_A_OWNER_EMAIL
      : process.env.VERIFY_B_OWNER_EMAIL;
  if (!ownerEmail) throw new Error(`VERIFY_${label}_OWNER_EMAIL required`);

  const operationId = crypto.randomUUID();
  const result = await client.database.rpc("platform_provision_company", {
    p_operation_id: operationId,
    p_name: `VF ${label} ${runId}`,
    p_owner_email: ownerEmail,
    p_owner_name: `Verify ${label}`,
  });

  return { operationId, result, runId };
}

export const ISOLATION_SAMPLE_TABLES = [
  "products",
  "suppliers",
  "customers",
  "purchase_orders",
  "notifications",
] as const;
