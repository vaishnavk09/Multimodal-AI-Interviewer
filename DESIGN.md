---
name: InterviewCoach
description: Focused multimodal interview practice desk for stronger next answers.
colors:
  ink: "#182329"
  ink-soft: "#31434a"
  muted: "#65767a"
  line: "#d8e2df"
  paper: "#ffffff"
  wash: "#eef3f2"
  accent: "#e5664d"
  accent-deep: "#bb4938"
  teal: "#0c8179"
  teal-soft: "#d9f0eb"
  saffron: "#d79d2c"
  saffron-soft: "#fff0c9"
  coral-soft: "#ffe4dc"
  field: "#f8fbfa"
  blue-soft: "#e2eff4"
  blue-ink: "#236077"
  teal-ink: "#11645e"
  saffron-ink: "#86601c"
  focus-ring: "rgba(229, 102, 77, .32)"
typography:
  display:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.04em"
  title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-.04em"
  body:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: ".75rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: ".12em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  page: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "11px"
    padding: "12px 14px"
  surface-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  status-success:
    backgroundColor: "{colors.teal-soft}"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  status-attention:
    backgroundColor: "{colors.saffron-soft}"
    textColor: "{colors.saffron-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: InterviewCoach

## Overview

**Creative North Star: "The Practice Desk"**

InterviewCoach is a focused assessment practice desk: a calm working surface where preparation, live answering, and feedback remain part of one repeatable session. The pale blue-grey canvas keeps the app quiet, while ink navy structure gives the work hierarchy and coral marks the next deliberate action.

The interface is operational and candid rather than gamified. Crisp white surfaces frame real tasks, analytics, and device status; teal verifies healthy progress, and saffron calls out attention or coaching context. Generous page padding and compact labels make the dense workflow scannable across dashboard, interview, history, and auth routes.

**Key Characteristics:**
- Pale blue-grey working canvas with ink navy structure.
- Coral action path, teal verification, and saffron attention states.
- IBM Plex Sans headings paired with DM Sans body copy.
- Lightly elevated white surfaces that frame real work.

## Colors

The palette is restrained and functional: one warm action color against cool structure, with semantic teal and saffron accents.

### Primary
- **Working Coral** (#e5664d): Primary start, submit, sign-up, and navigation actions.
- **Deep Coral** (#bb4938): Hover and pressed-feeling action state.

### Secondary
- **Verified Teal** (#0c8179): Auth kicker and healthy/ready status emphasis.
- **Teal Wash** (#d9f0eb): Healthy state surfaces and positive speech/device feedback.

### Tertiary
- **Attention Saffron** (#d79d2c): Coaching and device attention emphasis.
- **Saffron Wash** (#fff0c9): Resume, status, and attention surfaces.

### Neutral
- **Ink Navy** (#182329): Primary text, dark welcome band, and interview structure.
- **Soft Ink** (#31434a): Secondary structural text.
- **Muted Ink** (#65767a): Supporting copy and quiet metadata.
- **Desk Canvas** (#eef3f2): Global page background.
- **Paper** (#ffffff): Cards, navigation, and auth surfaces.
- **Desk Line** (#d8e2df): Borders and dividers.
- **Field Tint** (#f8fbfa): Resting form controls.

### Named Rules
**The Signal Economy Rule.** Coral, teal, and saffron are reserved for actions and semantic status; do not turn every surface into an accent block.

## Typography

**Display Font:** IBM Plex Sans (with sans-serif)
**Body Font:** DM Sans (with Segoe UI, sans-serif fallback)
**Label/Mono Font:** DM Sans for compact labels; no separate mono face is established.

**Character:** IBM Plex Sans gives headings a firm, technical edge while DM Sans keeps form instructions, analytics metadata, and answer text approachable and readable.

### Hierarchy
- **Display** (700, 2rem, 1.2, -.04em): Welcome and major page titles.
- **Title** (700, 1.5rem, 1.25, -.04em): Auth headings and compact section titles.
- **Body** (400, 1rem, 1.5): Form copy, guidance, questions, and answer content.
- **Label** (700, .75rem, 1.35, .12em): Compact status and auth kicker labels, with uppercase treatment where used.

### Named Rules
**The Working Hierarchy Rule.** Use IBM Plex Sans to announce the task, then let DM Sans carry the explanation and input work.

## Layout

The shell uses a slim sticky navigation with a visible New Practice / History split. Auth pages center a compact card in the available viewport. Dashboard and history content sit in a centered max-width 5xl frame with 16px mobile gutters, 32px desktop gaps, and 40px vertical page padding; the dashboard becomes a 3:2 setup-to-progress grid at the large breakpoint and stacks on smaller screens.

The interview surface keeps the question and answer dominant in a 1:2 camera-to-work-area grid at the medium breakpoint. Device check, active interview, and completion states use the same centered frame and surface language. At widths below 640px, navigation gutters tighten, the user chip disappears, and auth card padding reduces for touch-friendly fit.

The spacing rhythm is compact inside controls (8px and 12px), open around work areas (16px, 24px, and 32px), and generous at page boundaries (40px, with 24px on narrow auth layouts).

## Elevation & Depth

InterviewCoach uses a lightly lifted hybrid: white surfaces sit above the blue-grey desk through thin cool borders and restrained diffuse shadows. The dark welcome band and camera monitor provide structural contrast; depth is never the main decoration. Sticky navigation adds a subtle blur and low shadow so it remains legible while scrolling.

### Shadow Vocabulary
- **Nav lift** (`0 8px 22px rgba(24, 35, 41, .05)`): Keeps the sticky navigation distinct from the canvas.
- **Surface lift** (`0 16px 40px rgba(24, 35, 41, .07)`): Auth and signature surface cards.
- **Compact lift** (`0 12px 28px rgba(24, 35, 41, .055)`): Dashboard, history, and interview work panels.
- **Action lift** (`0 8px 18px rgba(229, 102, 77, .2)`): Hover response for coral actions.

### Named Rules
**The Light-Lift Rule.** Borders establish the container; shadows support hierarchy and state without making the desk feel glossy or theatrical.

## Shapes

The form language is crisp but gently softened: 18px for major cards, 12px for controls and statuses, 11px for form fields, and pill silhouettes for compact user and score metadata. Borders are cool and quiet at rest, with coral focus rings and border shifts making the active field unmistakable.

## Components

### Buttons
- **Shape:** Gently softened controls (12px radius); navigation actions use 8px and primary page actions use the same compact family.
- **Primary:** Working Coral with white text, 12px vertical padding, and a full-width treatment when it is the main form action.
- **Hover / Focus:** Deep Coral plus a 1px upward shift and coral shadow on action hover; all interactive controls receive a 3px coral focus outline with 2px offset.
- **Secondary / Ghost / Tertiary:** White or transparent surfaces with ink-soft text and quiet borders; the text-only fallback remains available for camera and microphone limitations.

### Cards / Containers
- **Corner Style:** Major cards use gently rounded corners (18px); inner task panels use 12px.
- **Background:** Paper white on the desk canvas; the welcome band and camera monitor use ink navy.
- **Shadow Strategy:** Use the restrained lifts listed in Elevation & Depth, paired with the desk line border.
- **Border:** 1px desk line at rest; dashed line for the empty recent-session state.
- **Internal Padding:** 16px for compact status cards, 24px for work panels, 32px for auth cards.

### Inputs / Fields
- **Style:** Field Tint background, desk line border, 11px radius, and 12px by 14px internal padding.
- **Focus:** Paper background, Working Coral border, and a 4px translucent coral focus shadow.
- **Error / Disabled:** Error messages use red-tinted utility surfaces; disabled primary actions reduce opacity while preserving the same silhouette.

### Navigation
- **Style:** Sticky paper bar with a desk line bottom border, low shadow, and 12px backdrop blur.
- **Typography:** DM Sans semibold links; IBM Plex Sans for the InterviewCoach wordmark.
- **Default / Hover / Active:** Muted Ink at rest, Ink Navy on hover and active; coral CTA for sign-up and log out.
- **Mobile treatment:** 16px side gutters, compressed link gap, and hidden user chip.

### Practice Status
The practice desk uses compact semantic strips for microphone activity, person detection, session progress, previous-answer score, and upload/generation status. Teal marks verified or active speech states; saffron marks attention and fallback guidance; the interface retains a type-only route when capture is unavailable.

## Motion

Motion is operational rather than decorative. The dashboard's dark welcome band is the authored focal moment: it arrives with a short clipped reveal and settles into its resting shadow, followed by the practice workspace. Recent session rows use a restrained left-to-right stagger so the list reads as a connected set without delaying access to the form.

The shared page surface uses a brief upward arrival to preserve continuity between routes. Upload and AI-preparation status uses a soft saffron pulse to signal active work; it is reserved for a state that may change and should not be used as ambient decoration. Buttons use a small coral lift on hover to acknowledge intent without moving layout.

### Motion Rules
- Use `cubic-bezier(.16, 1, .3, 1)` for confident arrivals and keep routine transitions under 300ms.
- Keep all content visible in its default state; motion adds emphasis, never access.
- Keep the focal reveal bounded to the welcome band; do not turn every card or scroll section into a choreography.
- Respect `prefers-reduced-motion`: remove spatial movement and looping pulses while preserving visible state and feedback.

## Do's and Don'ts

### Do:
- **Do** keep the next practice action visibly coral and easy to find.
- **Do** use ink navy for structure and teal or saffron only when the state earns it.
- **Do** keep questions and answer entry dominant during live interview work.
- **Do** preserve keyboard focus visibility with the coral outline treatment.
- **Do** let the text-only path remain usable when camera or microphone access is unavailable.
- **Do** use white surfaces to frame real tasks, feedback, and progress rather than decorative feature tiles.

### Don't:
- **Don't** introduce a generic purple AI-dashboard palette.
- **Don't** flatten every workflow element into a decorative card.
- **Don't** use accent colors as ornamental gradients or large competing backgrounds.
- **Don't** hide device limitations or make camera access a prerequisite for typed answers.
- **Don't** replace IBM Plex Sans headings and DM Sans working copy with a system-only type pairing.
