export function rejectSetlistWrite() {
  return Response.json(
    { error: "Setlist data is read-only. Update the archive JSON and redeploy." },
    {
      status: 405,
      headers: { Allow: "GET" },
    },
  );
}
