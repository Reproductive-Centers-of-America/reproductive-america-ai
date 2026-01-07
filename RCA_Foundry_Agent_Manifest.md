# Reproductive America: AI Foundry Tool & Agent Manifest

This document outlines the exact technical configuration required to build the "Ultimate Boss" ecosystem within Microsoft AI Foundry.

---

## 1. The Central Data Hub (Microsoft Fabric / OneLake)
**Goal**: Create a single source of truth that the AI can query.

### Setup Steps:
1.  **Create a Lakehouse**: In Microsoft Fabric, create a new Lakehouse named `RCA_Clinical_Lakehouse`.
2.  **OneDrive Shortcut**: 
    - Go to the `Files` section of the Lakehouse.
    - Select `New Shortcut` -> `Microsoft OneDrive`.
    - Point it to your main clinical records folder.
3.  **Airtable Pipeline**:
    - Use **Data Factory** in Fabric.
    - Create a `Copy Data` activity.
    - **Source**: HTTP/REST API (Airtable API).
    - **Destination**: `RCA_Clinical_Lakehouse` as a Delta Table.
    - **Schedule**: Every 4 hours.

---

## 2. The AI Tools (Azure Functions / Prompty)
Define these as "Tools" in your AI Foundry project so the "Boss" can call them.

### Tool A: `get_patient_context`
- **Type**: Vector Search / SQL Query.
- **Logic**: Searches the `RCA_Clinical_Lakehouse` using the `RCA_Universal_Patient_Schema.json` for a patient's name or email.
- **Returns**: Last email, current cycle status, and coordinator name.

### Tool B: `triage_outlook_email`
- **Type**: Azure Function (Python + Microsoft Graph SDK).
- **Functionality**:
    - Input: `message_id`.
    - Logic: Checks OneLake for patient info -> Applies Outlook Category tag (`Susana`, `Andrea`, or `Dr. D`) -> Updates status to `Waiting` or `Replied`.

### Tool C: `digitalize_handwritten_form`
- **Type**: Azure AI Document Intelligence (Prebuilt-Health model).
- **Functionality**: Extracts data from scanned patient forms in OneDrive and returns a JSON payload compatible with the nAble API.

---

## 3. Agent Orchestration (The Foundry "Squad")
Configure these as separate agents within your Foundry project.

### Agent 1: The Executive (The Boss)
- **Prompt**: (Use the Chief of Staff prompt provided previously).
- **Tools**: All.
- **Role**: The main interface for Dr. D and the team.

### Agent 2: The nAble Specialist (Sub-Agent)
- **Prompt**: "You are an expert on the nAble EMR. Your only job is to format data for the nAble API and confirm successful uploads."
- **Tools**: `nable_create_patient`, `nable_book_appointment`.

### Agent 3: The Researcher (Sub-Agent)
- **Prompt**: "You are an expert at searching clinical files and emails. Use AI Search to find needles in haystacks."
- **Tools**: Vector Search over OneDrive/SharePoint.

---

## 4. Automation Workflows (The "Glue")
Use **Azure Logic Apps** to trigger the agents.

### Workflow: The Morning Briefing
1.  **Trigger**: Recurrence (Daily @ 7:00 AM).
2.  **Action**: Call Foundry Agent ("The Boss").
3.  **Input**: "Review Dr. D's calendar and today's nAble appointments. Who needs a follow-up today?"
4.  **Output**: Send SMS via **Azure Communication Services** to Dr. D.

### Workflow: New Webflow Lead
1.  **Trigger**: HTTP Request (from Webflow Form).
2.  **Action**: Call Foundry Agent ("The Boss").
3.  **Input**: "New lead: [Name]. Create their OneDrive folder and send the first template response."
4.  **Action**: Agent executes via Outlook and OneDrive tools.

---

## 5. Implementation Roadmap (Next 48 Hours)
1.  **Connect Fabric**: Set up the OneDrive Shortcut (Instant searchability).
2.  **Deploy Search**: Create the AI Search index over that shortcut.
3.  **Foundry Test**: Start a chat in Foundry and ask: "Who is the patient Andrea talked to in Spain?"
