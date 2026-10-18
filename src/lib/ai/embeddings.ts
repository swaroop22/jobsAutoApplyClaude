// Anthropic has no native embeddings endpoint; Voyage AI is Anthropic's
// recommended embeddings partner. voyage-large-2 outputs 1536 dimensions
// natively, matching the vector(1536) columns on profiles/jobs.
const VOYAGE_MODEL = "voyage-large-2";
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

type VoyageInputType = "query" | "document";

type VoyageEmbeddingsResponse = {
  data: Array<{ embedding: number[]; index: number }>;
};

async function requestEmbeddings(
  inputs: string[],
  inputType: VoyageInputType,
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: inputs,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as VoyageEmbeddingsResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// "document" input_type for the content being searched over (jobs).
export async function embedJobDescriptions(texts: string[]): Promise<number[][]> {
  return requestEmbeddings(texts, "document");
}

// "query" input_type for the side issuing the search (a candidate profile).
export async function embedProfileText(text: string): Promise<number[]> {
  const [embedding] = await requestEmbeddings([text], "query");
  return embedding;
}
