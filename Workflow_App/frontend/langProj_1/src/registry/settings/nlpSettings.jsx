// src/registry/settings/nlpSettings.jsx

import React, { useEffect, useState } from "react";
import { getNlpFeatures, listNlpVoices } from "../../services/api";
import { Field, SelectField, TextAreaField } from "./fields";
import MultiSelect from "./MultiSelect";
import VariableInput from "./VariableInput";
import { fieldWrap, lbl, checkRow, rowBox, rowHead, miniBtn, miniBtnDisabled, infoBox, sectionNote } from "./styles";

const sel = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

const Check = ({ label, checked, onChange }) => (
  <div style={fieldWrap}>
    <label style={checkRow}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  </div>
);

// ─── Per-feature forms: ({ o, set, common }) ──────────────────────────────────
const FORMS = {
  vectorization: ({ o, set }) => {
    const m = o.method || "word_index";
    return (
      <>
        <SelectField label="Method" value={m} onChange={(v) => set({ method: v })}
          options={sel(["word_index", "Word index + sequences (Keras-style)"], ["one_hot", "One-hot hashing"],
            ["count", "Count vectors"], ["tfidf", "TF-IDF vectors"], ["sentence_embedding", "Sentence embeddings"])} />
        {m === "word_index" && (
          <>
            <Check label="Pad sequences" checked={o.padding} onChange={(v) => set({ padding: v })} />
            {o.padding && <Field label="Max length (empty = longest)" type="number" value={o.max_length} onChange={(v) => set({ max_length: v || "" })} />}
          </>
        )}
        {m === "one_hot" && <Field label="Vocabulary size" type="number" value={o.vocab_size} onChange={(v) => set({ vocab_size: v || "" })} />}
        {(m === "count" || m === "tfidf") && <Field label="Max features" type="number" value={o.max_features ?? 500} onChange={(v) => set({ max_features: v })} />}
        {m === "sentence_embedding" && <Field label="Model" value={o.model} onChange={(v) => set({ model: v })} placeholder="all-MiniLM-L6-v2" />}
      </>
    );
  },

  tokenization: ({ o, set }) => (
    <>
      <SelectField label="Engine" value={o.engine || "auto"} onChange={(v) => set({ engine: v })}
        options={sel(["auto", "Auto (NLTK, else regex)"], ["nltk", "NLTK"], ["regex", "Regex"])} />
      <Check label="Lowercase tokens" checked={o.lowercase} onChange={(v) => set({ lowercase: v })} />
    </>
  ),

  sentiment_analysis: ({ o, set }) => (
    <>
      <SelectField label="Engine" value={o.engine || "textblob"} onChange={(v) => set({ engine: v })}
        options={sel(["textblob", "TextBlob (polarity)"], ["transformers", "Transformers model"])} />
      {(o.engine || "textblob") === "textblob"
        ? <Field label="Neutral threshold (0 = exact)" type="number" value={o.neutral_threshold ?? 0} onChange={(v) => set({ neutral_threshold: v })} />
        : <Field label="Model" value={o.model} onChange={(v) => set({ model: v })} placeholder="distilbert-base-uncased-finetuned-sst-2-english" />}
    </>
  ),

  text_classification: ({ o, set }) => {
    const m = o.method || "naive_bayes";
    return (
      <>
        <SelectField label="Method" value={m} onChange={(v) => set({ method: v })}
          options={sel(["naive_bayes", "Naive Bayes (train from examples)"], ["zero_shot", "Zero-shot model"])} />
        <TextAreaField label="Categories (one per line)" rows={3} value={o.labels} onChange={(v) => set({ labels: v })} placeholder={"positive\nnegative"} />
        {m === "naive_bayes" && (
          <TextAreaField label="Training examples (text | label per line)" rows={5} value={o.training_examples}
            onChange={(v) => set({ training_examples: v })} placeholder={"I love this | positive\nTerrible service | negative"} />
        )}
        {m === "zero_shot" && (
          <>
            <Field label="Model" value={o.model} onChange={(v) => set({ model: v })} placeholder="facebook/bart-large-mnli" />
            <Check label="Multi-label" checked={o.multi_label} onChange={(v) => set({ multi_label: v })} />
          </>
        )}
      </>
    );
  },

  machine_translation: ({ o, set }) => (
    <>
      <Field label="Source language code (auto = detect)" value={o.source_lang ?? "auto"} onChange={(v) => set({ source_lang: v })} placeholder="auto, en, fr…" />
      <Field label="Target language code *" value={o.target_lang} onChange={(v) => set({ target_lang: v })} placeholder="hi, fr, de…" />
      <Field label="Model override (optional)" value={o.model} onChange={(v) => set({ model: v })} placeholder="Helsinki-NLP/opus-mt-{src}-{tgt}" />
    </>
  ),

  ner: ({ o, set }) => (
    <Field label="spaCy model" value={o.spacy_model ?? "en_core_web_sm"} onChange={(v) => set({ spacy_model: v })} />
  ),

  summarization: ({ o, set }) => {
    const m = o.method || "frequency";
    return (
      <>
        <SelectField label="Method" value={m} onChange={(v) => set({ method: v })}
          options={sel(["frequency", "Extractive (built-in)"], ["lsa", "Extractive (sumy LSA)"], ["transformers", "Abstractive (transformers)"])} />
        {m !== "transformers" && <Field label="Summary sentences" type="number" value={o.sentences ?? 3} onChange={(v) => set({ sentences: v })} />}
        {m === "transformers" && (
          <>
            <Field label="Model" value={o.model} onChange={(v) => set({ model: v })} placeholder="sshleifer/distilbart-cnn-12-6" />
            <Field label="Max length" type="number" value={o.max_length ?? 60} onChange={(v) => set({ max_length: v })} />
            <Field label="Min length" type="number" value={o.min_length ?? 20} onChange={(v) => set({ min_length: v })} />
          </>
        )}
        <SelectField label="Output format" value={o.format || "text"} onChange={(v) => set({ format: v })} options={sel(["text", "Paragraph"], ["bullets", "Bullets"])} />
      </>
    );
  },

  speech_recognition: ({ o, set }) => {
    const e = o.engine || "google";
    return (
      <>
        <div style={sectionNote}>Map the Start node's "Uploaded Files" (WAV, AIFF or FLAC) to the NLP "Audio File(s)" input.</div>
        <SelectField label="Engine" value={e} onChange={(v) => set({ engine: v })} options={sel(["google", "Google Web Speech (online)"], ["whisper", "Whisper (local)"])} />
        <Field label="Language" value={o.language ?? (e === "google" ? "en-US" : "")} onChange={(v) => set({ language: v })} placeholder={e === "google" ? "en-US" : "en (empty = auto)"} />
        {e === "whisper" && <SelectField label="Whisper model" value={o.whisper_model || "base"} onChange={(v) => set({ whisper_model: v })} options={sel(["tiny", "tiny"], ["base", "base"], ["small", "small"], ["medium", "medium"])} />}
      </>
    );
  },

  spell_check: ({ o, set }) => (
    <>
      <SelectField label="Engine" value={o.engine || "textblob"} onChange={(v) => set({ engine: v })} options={sel(["textblob", "TextBlob"], ["autocorrect", "autocorrect"])} />
      {o.engine === "autocorrect" && <Field label="Language" value={o.language ?? "en"} onChange={(v) => set({ language: v })} />}
    </>
  ),

  information_retrieval: ({ o, set, common }) => (
    <>
      <VariableInput {...common} label="Search query (empty = input text)" value={o.query} onChange={(v) => set({ query: v })} placeholder="{{Start.question}}" />
      <VariableInput {...common} label="Documents (blank-line separated, or map the Documents input)" multiline rows={4} mode="append"
        value={o.documents} onChange={(v) => set({ documents: v })} placeholder="{{Search_URLs.results}}" />
      <Field label="Top K" type="number" value={o.top_k ?? 5} onChange={(v) => set({ top_k: v })} />
    </>
  ),

  language_detection: () => <div style={sectionNote}>No settings. Uses langdetect.</div>,

  keyword_extraction: ({ o, set }) => (
    <>
      <SelectField label="Engine" value={o.engine || "builtin"} onChange={(v) => set({ engine: v })} options={sel(["builtin", "RAKE (built-in)"], ["rake_nltk", "rake-nltk"])} />
      <Field label="Top N" type="number" value={o.top_n ?? 10} onChange={(v) => set({ top_n: v })} />
      <Field label="Max words per phrase" type="number" value={o.max_phrase_words ?? 4} onChange={(v) => set({ max_phrase_words: v })} />
    </>
  ),

  topic_modeling: ({ o, set }) => (
    <>
      <div style={sectionNote}>Uses the Documents input, a list of texts, or splits a single text into paragraphs / sentences.</div>
      <Field label="Number of topics" type="number" value={o.num_topics ?? 3} onChange={(v) => set({ num_topics: v })} />
      <Field label="Words per topic" type="number" value={o.top_words ?? 8} onChange={(v) => set({ top_words: v })} />
    </>
  ),

  text_to_speech: function Tts({ o, set }) {
    const [voices, setVoices] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const load = async () => {
      setBusy(true);
      setErr("");
      try {
        setVoices((await listNlpVoices()).voices || []);
      } catch (e) {
        setErr(e?.response?.data?.detail || "Failed to list voices.");
      } finally {
        setBusy(false);
      }
    };
    const options = [{ value: "", label: "Default voice" }, ...voices.map((v) => ({ value: v.id, label: v.name }))];
    if (o.voice && !voices.some((v) => v.id === o.voice)) options.push({ value: o.voice, label: o.voice });
    return (
      <>
        <SelectField label="Voice" value={o.voice || ""} onChange={(v) => set({ voice: v })} options={options} />
        <div style={{ marginBottom: 10 }}>
          <button type="button" style={{ ...miniBtn, ...(busy ? miniBtnDisabled : {}) }} disabled={busy} onClick={load}>
            {busy ? "Loading…" : "⟳ Load Installed Voices"}
          </button>
        </div>
        {err && <div style={infoBox(true)}>⚠ {err}</div>}
        <Field label="Language filter (used when no voice is selected)" value={o.language} onChange={(v) => set({ language: v })} placeholder="en" />
        <Field label="Rate" type="number" value={o.rate ?? 150} onChange={(v) => set({ rate: v })} />
        <Field label="Volume (0–1)" type="number" value={o.volume ?? 1} onChange={(v) => set({ volume: v })} />
        <Field label="Output folder (inside download/)" value={o.output_folder ?? "nlp_audio"} onChange={(v) => set({ output_folder: v })} />
      </>
    );
  },

  question_answering: ({ o, set, common }) => (
    <>
      <VariableInput {...common} label="Question (empty = Question input)" value={o.question} onChange={(v) => set({ question: v })} placeholder="{{Start.question}}" />
      <VariableInput {...common} label="Context (empty = Context input or input text)" multiline rows={4} mode="append"
        value={o.context} onChange={(v) => set({ context: v })} placeholder="{{Retrieve.documents}}" />
      <Field label="Model" value={o.model} onChange={(v) => set({ model: v })} placeholder="distilbert-base-cased-distilled-squad" />
    </>
  ),

  text_similarity: ({ o, set, common }) => (
    <>
      <VariableInput {...common} label="Compare texts (blank-line separated; empty = input is a list)" multiline rows={4} mode="append"
        value={o.compare_texts} onChange={(v) => set({ compare_texts: v })} placeholder="{{Start.other_text}}" />
      <SelectField label="Method" value={o.method || "tfidf_cosine"} onChange={(v) => set({ method: v })}
        options={sel(["tfidf_cosine", "TF-IDF cosine"], ["jaccard", "Jaccard"], ["embedding", "Sentence embeddings"])} />
      {o.method === "embedding" && <Field label="Model" value={o.model} onChange={(v) => set({ model: v })} placeholder="all-MiniLM-L6-v2" />}
      <Field label="Duplicate threshold (0–1)" type="number" value={o.threshold ?? 0.8} onChange={(v) => set({ threshold: v })} />
    </>
  ),

  stemming: ({ o, set }) => (
    <>
      <SelectField label="Algorithm" value={o.algorithm || "porter"} onChange={(v) => set({ algorithm: v })} options={sel(["porter", "Porter"], ["snowball", "Snowball"])} />
      {o.algorithm === "snowball" && <Field label="Language" value={o.language ?? "english"} onChange={(v) => set({ language: v })} />}
    </>
  ),

  lemmatization: ({ o, set }) => (
    <SelectField label="Part of speech" value={o.pos || "n"} onChange={(v) => set({ pos: v })}
      options={sel(["n", "Noun"], ["v", "Verb"], ["a", "Adjective"], ["r", "Adverb"])} />
  ),

  text_segmentation: ({ o, set }) => (
    <>
      <SelectField label="Unit" value={o.unit || "sentences"} onChange={(v) => set({ unit: v })} options={sel(["sentences", "Sentences"], ["paragraphs", "Paragraphs"], ["both", "Both"])} />
      <SelectField label="Engine" value={o.engine || "auto"} onChange={(v) => set({ engine: v })} options={sel(["auto", "Auto (NLTK, else regex)"], ["nltk", "NLTK"], ["regex", "Regex"])} />
    </>
  ),
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export default function NlpSettings({ localData, patch, selectedNodeId, flowId, variablesVersion }) {
  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getNlpFeatures()
      .then((d) => { if (!cancelled) setCatalog(d.features || []); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || "Failed to load NLP features."); });
    return () => { cancelled = true; };
  }, []);

  const features = Array.isArray(localData.features) ? localData.features : [];
  const options = localData.options || {};
  const optOf = (k) => options[k] || {};
  const setOpt = (k, u) => patch({ options: { ...options, [k]: { ...optOf(k), ...u } } });
  const common = { nodeId: selectedNodeId, flowId, variablesVersion };
  const labelOf = (k) => catalog.find((f) => f.key === k)?.label || k;

  const errors = [];
  if (features.length === 0) errors.push("Select at least one NLP feature.");
  if (features.includes("machine_translation") && !(optOf("machine_translation").target_lang || "").trim()) {
    errors.push("Machine Translation: target language is required.");
  }
  if (features.includes("text_classification")) {
    const o = optOf("text_classification");
    if ((o.method || "naive_bayes") === "zero_shot" && !(o.labels || "").trim()) {
      errors.push("Text Classification: add at least two categories.");
    }
    if ((o.method || "naive_bayes") === "naive_bayes" && !(o.training_examples || "").trim()) {
      errors.push("Text Classification: add training examples (text | label).");
    }
  }

  return (
    <>
      <MultiSelect
        label="NLP Features *"
        options={catalog.map((f) => ({ value: f.key, label: f.label, description: f.description }))}
        value={features}
        onChange={(list) => patch({ features: list })}
        placeholder="No features selected"
      />
      {error && <div style={infoBox(true)}>⚠ {error}</div>}

      <div style={sectionNote}>
        Each selected feature runs independently and becomes its own selectable output
        (use a Path for nested fields, e.g. label or entities). A failing feature does not stop the others.
        Input comes from the connected node, Input Value Mapping, or the extra Documents / Context / Question / Audio inputs.
      </div>

      <div style={fieldWrap}>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={!!localData.allow_model_download}
            onChange={(e) => patch({ allow_model_download: e.target.checked })}
          />
          Allow model download (Hugging Face / Whisper models, may be large)
        </label>
      </div>

      {features.map((k) => {
        const Form = FORMS[k];
        return (
          <div key={k} style={rowBox}>
            <div style={rowHead}>
              <span style={{ ...lbl, marginBottom: 0, color: "#fda4af" }}>{labelOf(k)}</span>
            </div>
            {Form ? <Form o={optOf(k)} set={(u) => setOpt(k, u)} common={common} /> : null}
          </div>
        );
      })}

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}