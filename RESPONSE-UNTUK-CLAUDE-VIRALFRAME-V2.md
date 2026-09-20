# Balasan untuk Claude Opus — Rekomendasi Arsitektur ViralFrame v2

## Tujuan dokumen

Dokumen ini adalah balasan teknis dan konseptual terhadap brief **ViralFrame** yang menjelaskan kondisi sistem saat ini, diagnosis kenapa hasil otomatis masih kalah dibanding storyboard yang dibuat langsung oleh model AI, serta rekomendasi arsitektur baru agar ViralFrame berkembang dari **generator storyboard berbasis aturan** menjadi **creative-director system** yang mampu:

- memahami listing dan foto secara kontekstual,
- memilih creative opportunity terbaik,
- menghasilkan Creative DNA yang berbeda untuk tiap versi,
- membuat hook yang benar-benar stop-scroll,
- mengaudit retensi,
- menjaga fidelity terhadap reference image,
- membuat prompt Google Flow/Veo yang lebih directable,
- menjaga continuity antar 3 generate terpisah,
- memilih model AI berdasarkan tugas,
- belajar dari hasil render,
- dan tetap hemat kuota/API.

Dokumen ini **tidak menyarankan membongkar sistem dari nol**. Fondasi ViralFrame yang sudah ada — Vision AI, Product DNA, Agent DNA, hard validator, photo ID validation, word budget, forbidden claims, dan deterministic prompt renderer — justru perlu dipertahankan.

Perubahan terbesar adalah menambahkan **lapisan creative intelligence** di antara data/fakta dan storyboard generator.

---

# 1. Kesimpulan diagnosis utama

Arsitektur sekarang secara sederhana:

```text
DATABASE LISTING
       ↓
VISION AI
       ↓
PRODUCT DNA
       ↓
SYSTEM RANDOMIZER
       │
       ├── Story mechanism
       ├── Hook type
       ├── Rhythm
       ├── Mood
       └── Opening photo
       ↓
AI STORYBOARD
       ↓
JSON
       ↓
DETERMINISTIC FLOW PROMPT RENDERER
       ↓
GOOGLE FLOW
```

Masalah mendasarnya bukan bahwa JSON buruk atau deterministic renderer salah.

Masalah utamanya:

> **Creative recipe dipilih sebelum sistem memahami creative opportunity dari listing.**

Sekarang sistem memakai prinsip:

```text
STYLE / VARIATION
      ↓
STORY
```

Yang lebih tepat:

```text
EVIDENCE + AUDIENCE + VISUAL OPPORTUNITY
      ↓
CREATIVE OPPORTUNITY
      ↓
CREATIVE DNA
      ↓
STORY
      ↓
VARIATION / NOVELTY CONTROL
```

Dengan kata lain:

> **Jangan biarkan randomizer menjadi Creative Director.**
>
> Randomizer/variation system sebaiknya berubah menjadi **Diversity Controller**.

---

# 2. Kenapa output manual AI terasa lebih bagus

Ketika user meminta storyboard langsung ke AI, proses implisit biasanya lebih dekat ke:

```text
UNDERSTAND LISTING
      ↓
NOTICE WHAT IS INTERESTING
      ↓
CHOOSE ANGLE
      ↓
DESIGN HOOK
      ↓
BUILD STORY
      ↓
PLAN PAYOFF
      ↓
WRITE OUTPUT
```

Sedangkan prompt ViralFrame saat ini meminta AI dalam satu langkah untuk sekaligus patuh pada mechanism, hook category, rhythm, mood, opening photo, room constraint, photo ID, word count, CTA, forbidden claims, output JSON, grammar kamera/aksi, dan tetap kreatif.

Akibatnya sebagian besar perhatian model habis untuk **jangan salah**, bukan **buat cerita terbaik**.

JSON bukan masalah utama. Yang perlu dipisah adalah:

```text
CREATIVE DECISION
vs
COMPLIANCE / STRUCTURED EXECUTION
```

---

# 3. Prinsip ViralFrame v2

ViralFrame v2 sebaiknya memiliki filosofi:

```text
CODE menjaga KEBENARAN
AI menjaga KREATIVITAS
CRITIC menjaga KUALITAS
DATABASE menjaga MEMORI
```

Empat fungsi ini sebaiknya tidak dicampur.

---

# 4. VIRALENGINE sebagai Creative Brain ViralFrame

Konsep VIRALENGINE sebaiknya menjadi lapisan otak di dalam ViralFrame.

```text
SALAMBUMI DATABASE
        +
REFERENCE IMAGES
        +
AGENT DNA
        ↓
SOURCE TRUTH ENGINE
        ↓
VISUAL OPPORTUNITY ENGINE
        ↓
AUDIENCE / INTENT ENGINE
        ↓
CREATIVE OPPORTUNITY ENGINE
        ↓
CREATIVE DNA ENGINE
        ↓
NOVELTY ENGINE
        ↓
HOOK ENGINE
        ↓
RETENTION ENGINE
        ↓
STORY ENGINE
        ↓
STORYBOARD DIRECTOR
        ↓
CREATIVE CRITIC / QA
        ↓
REPAIR
        ↓
RENDERABILITY ENGINE
        ↓
FLOW INTENT ENGINE
        ↓
CONTINUITY ENGINE
        ↓
REALISM / REFERENCE LOCK
        ↓
DETERMINISTIC COMPILER
        ↓
GOOGLE FLOW / VEO
        ↓
CAPTION ENGINE
        ↓
HASHTAG ROTATION ENGINE
        ↓
CREATIVE LEDGER
        ↓
FEEDBACK / LEARNING LOOP
```

---

# 5. Jangan membuat semua engine menjadi API call

Nama-nama Engine di atas adalah **logical modules**, bukan berarti harus ada banyak API call.

Rekomendasi runtime awal:

```text
CALL 1:
Creative Director
- creative opportunity
- audience
- candidate DNA
- hook
- retention plan
- story outline

CALL 2:
Storyboard + Flow Intent

CALL 3:
Critic / Repair
```

Sebagian modul tetap dikerjakan kode deterministic.

---

# 6. Source Truth Engine

Fondasi yang sudah ada harus dipertahankan.

Input:

- database listing,
- Product DNA,
- forbidden claims,
- Vision AI labels,
- image metadata,
- owner description.

Output internal:

```json
{
  "confirmed_facts": [],
  "visual_facts": [],
  "forbidden_claims": [],
  "uncertain_claims": []
}
```

AI tidak boleh mengubah `uncertain_claims` menjadi fakta.

Truth lebih penting daripada novelty, cinematic style, atau hook.

---

# 7. Visual Opportunity Engine

Vision AI sebaiknya tidak berhenti pada label, skor, dan note.

Tambahkan interpretasi temporal:

```json
{
  "photo_id": 2101,
  "room": "facade",
  "visual_strength": "symmetry_and_scale",
  "best_story_use": ["opening_reveal", "premium_establishing"],
  "possible_actions": [
    "presenter_steps_aside_to_reveal_facade",
    "slow_forward_reveal"
  ],
  "retention_function": "scale_reveal",
  "render_risks": [
    "avoid_large_camera_travel",
    "avoid_inventing_unseen_side_geometry"
  ]
}
```

Tujuan:

> Foto dipilih bukan hanya karena bagus, tetapi karena **punya fungsi cerita**.

---

# 8. Evidence-to-Creative Engine

Contoh:

```text
FACT:
LT 492m²

VISUAL:
large symmetrical facade

LOCATION:
Mrican / Caturtunggal
```

Jangan langsung menjadi:

```text
Hook = question
Mood = warm
```

Tetapi:

```text
CREATIVE OPPORTUNITY:
"Sense of scale in a central urban location"
```

Contoh opportunities:

```text
A. SCALE
492m² land + 400m² building

B. SPACE EXPERIENCE
high ceiling + natural daylight

C. LOCATION + SCALE
Mrican/Caturtunggal + large property

D. DISCOVERY
facade → interior reveal

E. FUNCTIONAL FLOW
living → kitchen/dining → bedroom
```

---

# 9. Audience / Intent Engine

Minimal klasifikasi:

```text
buyer_family
investor
owner_user
business_buyer
land_buyer
kost_investor
hotel_investor
premium_buyer
```

Output:

```json
{
  "primary_audience": "premium_family_buyer",
  "primary_desire": "space_in_strategic_area",
  "primary_objection": "price_vs_value",
  "decision_trigger": "location_and_scale"
}
```

Creative angle harus mengikuti audience, bukan kombinasi random.

---

# 10. Creative Opportunity Engine

Buat beberapa kandidat:

```json
{
  "candidates": [
    {
      "angle": "scale",
      "reason": "...",
      "visual_support": [2101, 2103],
      "fact_support": ["LT 492m²", "LB 400m²"]
    },
    {
      "angle": "space_experience",
      "reason": "...",
      "visual_support": [2103],
      "fact_support": []
    }
  ]
}
```

Rank berdasarkan:

```text
truth
visual support
audience fit
hook potential
retention potential
renderability
novelty
```

---

# 11. Creative DNA Engine

Setiap versi harus punya fingerprint:

```json
{
  "source_id": "SBP-XXXX",
  "version": 1,
  "primary_angle": "scale",
  "hook_type": "specific_curiosity",
  "hook_promise": "large urban home",
  "pattern_interrupt": "presenter_step_aside_reveal",
  "psychological_driver": "discovery",
  "narrative_structure": "scale_to_space_to_action",
  "opening_visual": "facade_reveal",
  "information_order": ["location", "scale", "interior_space", "CTA"],
  "pacing_profile": "progressive_discovery",
  "camera_language": "controlled_observational",
  "vo_style": "conversational_premium",
  "payoff": "sense_of_space",
  "cta_style": "survey_discovery"
}
```

Ini lebih bermakna daripada `variation_key` sederhana.

---

# 12. Novelty Engine

Creative baru dibandingkan terhadap semua versi sebelumnya untuk listing yang sama:

```text
angle
hook mechanism
pattern interrupt
psychology
narrative
opening visual
information order
pacing
camera language
VO structure
payoff
CTA
caption
hashtags
```

Perubahan berikut **tidak cukup** dianggap versi baru:

- sinonim,
- parafrase,
- adjective berbeda,
- minor camera move,
- transition kosmetik,
- hook sama dengan wording berbeda.

Gunakan heuristic Creative Distance:

```text
< 75%   reject
75–84%  revise
>= 85%  pass
```

Hanya sebagai quality-control heuristic.

---

# 13. Ubah Randomizer menjadi Diversity Controller

## Sekarang

```text
SYSTEM RANDOMIZER
      ↓
AI MUST OBEY
```

## Usulan

```text
AI GENERATES CANDIDATE DNA
      ↓
NOVELTY CONTROLLER
      ↓
REMOVE USED / TOO-SIMILAR TERRITORY
      ↓
QUALITY RANKER
      ↓
SELECT BEST AVAILABLE DNA
```

Jika deterministic variation tetap ingin dipakai, jadikan sebagai **soft diversity pressure**, misalnya:

```json
{
  "avoid_angles": ["price_shock", "hidden_gem"],
  "prefer_pacing_not_used_recently": true,
  "opening_photo_not_used_recently": true
}
```

---

# 14. Hook Engine

Hook bukan hanya kategori.

Hook Engine membuat beberapa kandidat lalu mengevaluasi:

```text
Why stop?
Why care?
What promise?
Can visual pay it off?
Is it supported by truth?
```

Hindari:

- sapaan,
- hook generik,
- clickbait yang tidak dibayar,
- angka hanya untuk memenuhi validator.

---

# 15. Retention Engine

`Part 1 = Hook / Part 2 = Body / Part 3 = CTA` adalah struktur, bukan retention strategy.

Retention Engine menilai:

```text
0s   → alasan berhenti?
2s   → apa pertanyaan terbuka?
5s   → informasi baru?
9s   → kenapa masuk Part 2?
10s  → continuity state?
14s  → visual novelty?
19s  → kenapa masuk Part 3?
24s  → payoff mulai dibayar?
28s  → CTA terasa earned?
```

Gunakan:

- curiosity gap,
- information progression,
- visual reveal,
- proof,
- escalating value,
- micro-tension,
- payoff,
- open loop.

Prinsip penting:

> **Information Change > Cut Count**

Tiga cut tidak otomatis lebih engaging daripada dua shot yang punya progression jelas.

---

# 16. Story Engine

Sebelum shot, buat story architecture global:

```json
{
  "global_story": {
    "promise": "...",
    "part_1_role": "...",
    "part_1_open_loop": "...",
    "part_2_payoff": "...",
    "part_2_open_loop": "...",
    "part_3_payoff": "...",
    "final_cta": "..."
  }
}
```

3 × 10 detik harus terasa sebagai satu cerita.

---

# 17. Storyboard Director

Setiap shot idealnya memiliki:

```json
{
  "start_time": 0,
  "end_time": 4,
  "photo_id": 2101,
  "shot_goal": "reveal_scale",
  "start_state": "...",
  "subject_action": "...",
  "camera_action": "...",
  "reveal": "...",
  "end_state": "...",
  "retention_function": "...",
  "continuity_note": "..."
}
```

Lebih kaya daripada hanya:

```json
{
  "kamera": "Medium shot, push in",
  "aksi": "Hana points at facade"
}
```

---

# 18. Creative Critic harus terpisah dari Creator

Logical pattern:

```text
CREATOR
   ↓
STORYBOARD
   ↓
CRITIC
   ↓
PASS / REPAIR
```

Critic mencari:

- alasan penonton swipe,
- hook generik,
- beat tanpa informasi baru,
- payoff lemah,
- CTA ditempel,
- foto tidak mendukung aksi,
- hallucination risk,
- renderability risk,
- repetition vs previous version,
- AI-generic visual.

Output:

```json
{
  "pass": false,
  "issues": [
    {
      "dimension": "retention",
      "severity": "high",
      "problem": "...",
      "repair_instruction": "..."
    }
  ]
}
```

---

# 19. Repair Call

Jika gagal, jangan generate ulang semuanya.

Gunakan:

```text
ORIGINAL
+
CRITIC ISSUES
```

Instruksi:

> Repair failed dimensions only. Preserve components that passed.

---

# 20. Renderability Engine

Sebelum Flow, cek:

```text
Can reference image support this action?
Can subject plausibly exist in scene?
Does camera movement reveal unseen geometry?
Does scene require spatial reconstruction?
Does subject motion increase face drift?
Does action create morph risk?
Does it require readable generated text?
Does it require impossible transition?
```

Output:

```json
{
  "renderability": "medium",
  "risks": ["scene_hallucination", "face_drift"],
  "recommended_repairs": ["reduce_camera_travel", "reduce_head_rotation"]
}
```

---

# 21. Reference Allocation Engine

Jangan selalu asumsikan:

```text
1 SUBJECT
2 SCENE
3 STYLE
```

Untuk properti, kadang lebih masuk akal:

```text
1 SUBJECT
2 PRIMARY SCENE
3 SUPPORTING SCENE
```

Pilih berdasarkan:

```text
identity stability
scene fidelity
story support
continuity
renderability
```

Tetapi ini harus diuji A/B pada Flow.

---

# 22. Flow Intent Engine

Deterministic compiler tetap dipertahankan.

Tetapi inputnya berupa Flow Intent Spec:

```json
{
  "scene_goal": "reveal_high_ceiling",
  "reference_priority": ["scene_geometry", "subject_identity"],
  "start_state": "...",
  "subject_action": "...",
  "camera_action": "...",
  "reveal": "...",
  "end_state": "...",
  "lighting_intent": "...",
  "audio_intent": "...",
  "continuity_in": "...",
  "continuity_out": "...",
  "negative_constraints": [],
  "render_risks": []
}
```

Lalu code compiler merender prose prompt final.

---

# 23. Temporal intent lebih penting daripada adjective cinematography

Style seperti warm, cinematic, golden, mirrorless, shallow depth of field tetap berguna.

Tetapi video generator lebih membutuhkan:

```text
START STATE
     ↓
ACTION
     ↓
REVEAL
     ↓
END STATE
```

Contoh:

```text
Start with Hana partially blocking the facade.
She steps naturally to her left while the camera
moves forward slightly, progressively revealing
the full two-storey symmetry.
By second 3 the facade is fully visible.
Hold the final composition long enough for the
viewer to understand the scale.
```

Ini lebih directable daripada:

```text
Medium shot, slow push-in.
```

---

# 24. Continuity Engine

Continuity bukan hanya:

```text
same face
same clothes
same property
```

Tambahkan:

```text
story state
movement direction
eye line
subject position
camera direction
lighting direction
narrative state
```

Contoh:

```text
PART 1 END:
Hana finishes beside the entrance,
body angled toward the door.

PART 2 START:
Hana appears from matching screen direction
inside the living room.

PART 2 END:
Hana looks toward the kitchen opening.

PART 3 START:
Camera begins from the same implied eyeline
inside kitchen/dining.
```

---

# 25. Realism Engine

Audit:

```text
natural exposure
plausible light direction
stable geometry
real material response
stable property identity
natural human movement
plausible hand interaction
restrained camera motion
realistic depth of field
```

Hindari:

```text
plastic skin
camera teleport
unnecessary orbit
excessive bokeh
hyper-saturation
meaningless slow motion
floating objects
architecture drift
logo mutation
```

---

# 26. Render Risk Score

Sebelum prompt final:

```json
{
  "reference_fidelity_risk": "low",
  "face_drift_risk": "medium",
  "scene_hallucination_risk": "high",
  "morph_risk": "low",
  "voice_timing_risk": "low"
}
```

Jika high, repair sebelum user menerima prompt.

---

# 27. Caption Engine

Caption adalah bagian dari Creative Package.

Caption tidak boleh hanya menyalin VO.

Gunakan Caption DNA:

```json
{
  "opening_type": "opportunity",
  "primary_angle": "scale",
  "style": "premium_conversational",
  "length": "medium",
  "information_order": [],
  "cta_style": "survey",
  "emoji_strategy": "minimal"
}
```

Untuk versi berikutnya, caption harus materially different.

---

# 28. Hashtag Rotation Engine

Default tepat 5 hashtag.

Gunakan slot:

```text
1 niche
2 category
3 audience/intent
4 location/use-case
5 long-tail/discovery
```

Versi baru default memakai 5 hashtag berbeda dari versi sebelumnya.

Namun relevansi lebih penting daripada novelty.

---

# 29. Creative Ledger

Database contoh:

```text
creative_ledger
```

Kolom:

```text
id
listing_id
source_id
version
angle
hook_type
hook_summary
pattern_interrupt
psychological_driver
narrative_structure
opening_photo_id
information_order
pacing_profile
camera_language
vo_style
payoff_type
cta_style
caption_dna
hashtags
status
created_at
```

Status:

```text
unused
generated
rendered
published
winner
fatigued
rejected
```

---

# 30. Creative Pool

Untuk listing aktif, preload beberapa Creative DNA:

```text
LISTING
   ↓
Generate 10 candidate DNA
   ↓
store creative_pool
```

Ketika user membuat video:

```text
select best unused DNA
      ↓
storyboard
```

---

# 31. Explore Mode

Fitur:

```text
Explore 10 Concepts
```

Output hanya Creative DNA singkat dan benar-benar berbeda.

User memilih:

```text
Build #3
```

Baru lanjut storyboard.

---

# 32. Multi-model architecture

Provider tersedia:

- Gemini
- DeepSeek
- Groq
- OpenRouter

Jangan memilih satu model untuk semua tahap.

Gunakan **MODEL ROUTER**:

```text
VIRALFRAME
    ↓
VIRALENGINE BRAIN
    ↓
TASK
    ↓
MODEL ROUTER
    ↓
Gemini / DeepSeek / Groq / OpenRouter
```

Provider adalah executor, bukan brain.

---

# 33. Model Role Routing

Logical roles:

```text
VISION
CREATIVE_DIRECTOR
STORYBOARD
CRITIC
REPAIR
FLOW_INTENT
COPY
JSON_REPAIR
```

Database config:

```text
ai_profiles
```

Kolom contoh:

```text
role
provider
model
priority
cost_weight
quality_weight
supports_vision
supports_json
supports_reasoning
context_limit
enabled
```

---

# 34. Capability Router

Routing berdasarkan kebutuhan:

```text
requires_vision?
requires_reasoning?
requires_creativity?
requires_strict_json?
requires_long_context?
latency_sensitive?
cost_sensitive?
```

---

# 35. Cheap-first, Smart-Escalation

```text
FREE / CHEAP MODEL
       ↓
QUALITY GATE
       ↓
PASS? ─── YES → continue
  │
  NO
  ↓
STRONGER MODEL
       ↓
REPAIR
```

Tidak semua listing membutuhkan model paling kuat.

---

# 36. Model Tiers

```text
TIER 1 — FAST / FREE
Routine work

TIER 2 — CREATIVE
Difficult creative reasoning

TIER 3 — RESCUE
Only after quality gate failure
```

Jangan hard-code model permanen.

---

# 37. Creator dan Critic sebaiknya model berbeda bila memungkinkan

Contoh:

```text
Creator = Gemini
Critic  = DeepSeek
```

Tujuannya bukan menyatakan satu lebih baik, tetapi memanfaatkan failure pattern yang berbeda.

---

# 38. Jangan multi-model voting setiap saat

Tidak direkomendasikan:

```text
Gemini generate
DeepSeek generate
Groq generate
OpenRouter generate
↓
vote
```

Lebih efisien:

```text
ONE MODEL CREATES
      ↓
ANOTHER MODEL CRITIQUES
```

---

# 39. Multi-model cocok untuk Explore Mode

Contoh:

```text
Gemini      → 4 DNA
DeepSeek    → 4 DNA
OpenRouter  → 4 DNA
       ↓
semantic deduplication
       ↓
quality ranking
```

---

# 40. Cache Vision / Photo DNA

Vision AI tidak perlu dipanggil ulang setiap versi.

Simpan:

```text
photo_dna
```

Kolom contoh:

```text
photo_id
room_label
video_score
visual_strength
best_story_uses
possible_actions
render_risks
embedding
updated_at
```

---

# 41. Prompt Genome

Setiap prompt Flow simpan struktur:

```text
prompt_genome
```

Contoh:

```json
{
  "reference_strategy": "...",
  "shot_count": 2,
  "camera_motion": "slow_push",
  "subject_action": "step_aside",
  "head_rotation": "low",
  "scene_transition": "none",
  "dialog_word_count": 20,
  "opening_motion": "...",
  "end_state": "..."
}
```

Setelah video dinilai:

```text
face_consistency
property_fidelity
motion_quality
naturalness
flow_adherence
retention_quality
```

ViralFrame dapat menemukan pattern empiris yang benar-benar bekerja.

---

# 42. Feedback UI

Setelah render, user bisa memberi tag:

```text
□ wajah berubah
□ properti berubah
□ gerak kaku
□ terlalu AI
□ kamera aneh
□ suara aneh
□ pacing lemah
□ hook lemah
□ CTA lemah
```

Simpan dengan prompt genome.

---

# 43. Prompt Mutation

Jika render buruk, jangan selalu storyboard ulang.

Contoh:

```text
face drift
→ reduce head rotation
→ reduce occlusion
→ reduce fast motion

property drift
→ reduce camera travel
→ prioritize scene geometry
→ remove unsupported reveal

motion stiff
→ simplify subject action
→ allow natural pause
```

Generate mutated prompt, bukan creative baru.

---

# 44. Learning Loop

```text
PROMPT
   ↓
FLOW RENDER
   ↓
HUMAN FEEDBACK
   ↓
PROMPT GENOME + RESULT
   ↓
PATTERN LEARNING
   ↓
FUTURE PROMPT DECISIONS
```

Tahap awal cukup database statistics dan heuristic ranking.

---

# 45. Empirical Provider Score

Simpan:

```text
provider
model
task_role
pass_rate
repair_rate
avg_latency
avg_tokens
cost
json_valid_rate
critic_agreement
```

ViralFrame dapat mengetahui model mana bagus untuk role tertentu berdasarkan data sendiri.

---

# 46. Hard Validators tetap dipertahankan

Pertahankan:

- word budget,
- no greeting,
- price not spoken,
- no invented distance,
- valid photo ID,
- CTA object,
- cut duration,
- part duration,
- forbidden facts,
- room constraints.

Tambahkan:

```text
creative similarity
render risk
reference allocation
continuity state
```

---

# 47. Revisit Room Constraint

Aturan one-room-per-part masuk akal untuk mengurangi hallucination.

Tetapi jangan otomatis berarti 3 cut per room.

Gunakan:

```text
one scene per part
+
number of shots determined by story need
```

Rhythm sebaiknya soft parameter.

---

# 48. Reference Fidelity > Style Reference

Untuk properti, kemungkinan:

```text
Subject
Primary Scene
Supporting Scene
```

lebih bernilai daripada:

```text
Subject
Scene
Style
```

jika style dapat dideskripsikan lewat prompt.

Tetapi harus diuji A/B di Flow.

---

# 49. Suggested Runtime Pipeline

```text
USER CLICKS GENERATE
       ↓
LOAD:
Product DNA
Photo DNA
Agent DNA
Creative Ledger
       ↓
CALL 1 — CREATIVE DIRECTOR
       ↓
candidate opportunities
candidate DNA
selected DNA
hook
retention plan
global story
       ↓
DETERMINISTIC VALIDATION
       ↓
CALL 2 — STORYBOARD / FLOW INTENT
       ↓
storyboard
flow intent
continuity states
       ↓
CALL 3 — CRITIC
       ↓
PASS?
  ├─ YES
  │    ↓
  │ deterministic Flow compiler
  │
  └─ NO
       ↓
     REPAIR
       ↓
     revalidate
       ↓
Flow compiler
       ↓
CAPTION + HASHTAGS
       ↓
save Creative Ledger
```

---

# 50. Suggested Low-cost Runtime

Default:

```text
Gemini/free-tier candidate
       ↓
QUALITY GATE
       ↓
PASS → lanjut
FAIL → escalate hanya task yang gagal
```

Jangan escalate seluruh pipeline.

---

# 51. Suggested JSON — Creative Director

```json
{
  "source_id": "string",
  "audience": {
    "primary": "string",
    "desire": "string",
    "objection": "string",
    "decision_trigger": "string"
  },
  "creative_opportunities": [
    {
      "id": "A",
      "angle": "string",
      "reason": "string",
      "fact_support": [],
      "photo_support": []
    }
  ],
  "selected_dna": {
    "primary_angle": "string",
    "hook_type": "string",
    "hook_promise": "string",
    "pattern_interrupt": "string",
    "psychological_driver": "string",
    "narrative_structure": "string",
    "opening_photo_id": 0,
    "pacing_profile": "string",
    "camera_language": "string",
    "payoff": "string",
    "cta_style": "string"
  },
  "retention_plan": {
    "0_3": "string",
    "3_10": "string",
    "10_20": "string",
    "20_30": "string"
  },
  "global_story": {
    "promise": "string",
    "part_1_open_loop": "string",
    "part_2_payoff": "string",
    "part_2_open_loop": "string",
    "part_3_payoff": "string"
  }
}
```

---

# 52. Suggested JSON — Storyboard

```json
{
  "parts": [
    {
      "part": 1,
      "role": "hook",
      "scene_photo_ids": [2101],
      "continuity_in": "string",
      "continuity_out": "string",
      "cuts": [
        {
          "start": 0,
          "end": 4,
          "photo_id": 2101,
          "shot_goal": "string",
          "start_state": "string",
          "camera_action": "string",
          "subject_action": "string",
          "reveal": "string",
          "end_state": "string",
          "retention_function": "string"
        }
      ],
      "dialog": "string",
      "screen_text": "string"
    }
  ]
}
```

---

# 53. Suggested JSON — Flow Intent

```json
{
  "part": 1,
  "scene_goal": "string",
  "reference_priority": ["subject_identity", "scene_geometry"],
  "start_state": "string",
  "timeline": [
    {
      "start": 0,
      "end": 4,
      "camera": "string",
      "subject_action": "string",
      "visual_change": "string"
    }
  ],
  "end_state": "string",
  "audio": {
    "dialog": "string",
    "music": "string",
    "ambient": "string"
  },
  "negative_constraints": [],
  "render_risk": {
    "face": "low",
    "scene": "low",
    "morph": "low"
  }
}
```

---

# 54. Suggested Database Additions

Minimal:

```text
photo_dna
creative_pool
creative_ledger
prompt_genome
render_feedback
ai_profiles
ai_run_logs
```

---

# 55. Recommended Implementation Priority

## Phase 1 — Biggest quality gain

1. Creative Opportunity Engine
2. Creative DNA
3. Retention Engine
4. Creative Critic
5. Flow Intent schema

## Phase 2 — Diversity + reliability

6. Creative Ledger
7. Renderability Engine
8. Continuity Engine
9. Render Risk Score

## Phase 3 — Scale

10. Model Router
11. Smart escalation
12. Creative Pool
13. Explore Mode

## Phase 4 — Learning

14. Prompt Genome
15. Render Feedback
16. Prompt Mutation
17. Provider performance scoring

## Phase 5 — Distribution

18. Caption Engine
19. Hashtag Rotation
20. performance-feedback integration

---

# 56. Satu perubahan paling penting

Jika hanya boleh mengubah satu hal:

> **Jangan lagi memilih creative recipe secara acak sebelum memahami listing.**

Ganti:

```text
RANDOM RECIPE
      ↓
AI EXECUTION
```

menjadi:

```text
LISTING + PHOTOS
      ↓
CREATIVE OPPORTUNITY ANALYSIS
      ↓
MULTIPLE CREATIVE DNA
      ↓
NOVELTY / HISTORY FILTER
      ↓
QUALITY RANKING
      ↓
WINNING DNA
      ↓
STORYBOARD
```

---

# 57. Hal yang Jangan Dibuang dari ViralFrame Sekarang

Pertahankan:

- Vision AI
- photo labels
- video suitability score
- Product DNA
- forbidden claims
- Agent DNA
- valid photo ID checks
- word budget validation
- no greeting rule
- price-not-spoken rule
- distance hallucination guard
- CTA validation
- part-duration validation
- deterministic compiler.

Yang kurang bukan lebih banyak hard rules.

Yang kurang adalah:

```text
Creative Opportunity
Creative DNA
Hook Brain
Retention Brain
Critic
Flow Intent Brain
```

---

# 58. Filosofi Akhir

ViralFrame sebaiknya tidak diposisikan sebagai:

> AI generator storyboard

Tetapi sebagai:

> **AI Creative Director + Generative Video Production System untuk listing properti.**

Target:

```text
DATA
  ↓
TRUTH
  ↓
OPPORTUNITY
  ↓
CREATIVE DNA
  ↓
NOVELTY
  ↓
HOOK
  ↓
RETENTION
  ↓
STORY
  ↓
STORYBOARD
  ↓
CRITIC
  ↓
RENDERABILITY
  ↓
FLOW INTENT
  ↓
CONTINUITY
  ↓
PROMPT
  ↓
RENDER
  ↓
FEEDBACK
  ↓
LEARNING
```

---

# 59. Pesan Khusus untuk Claude Opus

Ketika mengimplementasikan rekomendasi ini:

1. Jangan langsung menambah banyak prompt panjang.
2. Jangan membuat semua logical engines menjadi API call terpisah.
3. Gunakan deterministic validation untuk hard facts.
4. Berikan ruang pada Creative Director untuk membuat beberapa kandidat.
5. Jangan membuang variation system; ubah menjadi semantic novelty controller.
6. Jangan memakai model terbaik untuk semua tugas; bangun model router.
7. Simpan hasil setiap render.
8. Optimalkan berdasarkan hasil nyata Google Flow.
9. Buat sistem modular agar provider/model dapat diganti.
10. Prioritaskan Phase 1 sebelum over-engineering.

---

# 60. Target Akhir ViralFrame v2

```text
✓ FACT-GROUNDED
✓ VISUAL-AWARE
✓ AUDIENCE-AWARE
✓ CREATIVE
✓ NON-REPETITIVE
✓ RETENTION-AWARE
✓ RENDERABILITY-AWARE
✓ FLOW-AWARE
✓ CONTINUITY-AWARE
✓ MULTI-MODEL
✓ COST-AWARE
✓ SELF-CRITIQUING
✓ LEARNING FROM RESULTS
```

Kecerdasan utama berada pada:

```text
VIRALENGINE BRAIN
+
CREATIVE LEDGER
+
PROMPT GENOME
+
QUALITY GATES
+
FEEDBACK DATA
```

Provider AI hanyalah executor yang dapat diganti.

---

# 61. Proposed High-level Final Architecture

```text
                      VIRALFRAME V2
                           │
            ┌──────────────┴──────────────┐
            │                             │
         DATA/TRUTH                  MODEL ROUTER
            │                             │
  Listing / Product DNA                Gemini
  Photo DNA                            DeepSeek
  Agent DNA                            Groq
  Forbidden Claims                    OpenRouter
            │                             │
            └──────────────┬──────────────┘
                           ↓
                    VIRALENGINE BRAIN
                           ↓
                  CREATIVE OPPORTUNITY
                           ↓
                     CREATIVE DNA
                           ↓
                    NOVELTY ENGINE
                           ↓
                       HOOK ENGINE
                           ↓
                   RETENTION ENGINE
                           ↓
                       STORY ENGINE
                           ↓
                  STORYBOARD DIRECTOR
                           ↓
                    CREATIVE CRITIC
                           ↓
                       REPAIR LOOP
                           ↓
                 RENDERABILITY ENGINE
                           ↓
                    FLOW INTENT SPEC
                           ↓
                  CONTINUITY ENGINE
                           ↓
                  REALISM / REF LOCK
                           ↓
                DETERMINISTIC COMPILER
                           ↓
                     RENDER RISK QA
                           ↓
                      GOOGLE FLOW
                           ↓
                      HUMAN REVIEW
                           ↓
                   PROMPT GENOME DB
                           ↓
                     LEARNING LOOP
                           ↓
                 FUTURE GENERATIONS
```

---

# 62. Prioritas Implementasi Berikutnya

Jangan langsung coding semua modul.

Mulai dari:

```text
A. struktur JSON Call 1 — Creative Director
B. struktur JSON Call 2 — Storyboard / Flow Intent
C. prompt Critic
D. repair loop
E. creative_ledger schema
F. model-router configuration
G. deterministic quality gates
```

Setelah itu lakukan A/B test:

```text
VIRALFRAME V1
vs
VIRALFRAME V2 Phase 1
```

Dengan listing dan foto yang sama.

Nilai:

```text
hook quality
story quality
novelty
property fidelity
face consistency
motion quality
renderability
manual preference
```

Baru lanjut Phase 2.

---

**End of document.**
