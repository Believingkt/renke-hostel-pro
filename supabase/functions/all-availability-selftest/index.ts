// Temporary self-test for all-availability master key auth. Prints status codes only.
Deno.serve(async () => {
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/all-availability?from=2026-08-11&to=2026-08-13`;
  const noKey = await fetch(base);
  const noKeyBody = await noKey.text();
  const withKey = await fetch(base, {
    headers: { "x-api-key": Deno.env.get("PLATFORM_MASTER_API_KEY") ?? "" },
  });
  const body = await withKey.json().catch(() => null);
  return new Response(
    JSON.stringify({
      no_key: { status: noKey.status, body: noKeyBody.slice(0, 200) },
      with_key: {
        status: withKey.status,
        accommodations: Array.isArray(body?.accommodations) ? body.accommodations.length : null,
        sample: body?.accommodations?.[0]
          ? {
              name: body.accommodations[0].name,
              room_type: body.accommodations[0].room_types?.[0]?.name,
              day: body.accommodations[0].room_types?.[0]?.days?.[0],
              package: body.accommodations[0].packages?.[0],
            }
          : null,
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
