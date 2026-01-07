# Reproductive America: Handover & Project Summary
**Date**: January 6, 2026
**Project**: The "Ultimate Boss" AI Ecosystem (Microsoft AI Foundry)

## 📁 Location of Key Files
All files are located in your `/Users/patriciasantos/Documents/Cline/` directory.

1.  **`RCA_Foundry_Agent_Manifest.md`**: The Master Blueprint. Contains the 4-Pillar architecture (Data Lake, Email Triage, nAble Bypass, Foundry Orchestration).
2.  **`RCA_Universal_Patient_Schema.json`**: The target data structure for migration. Use this when mapping Airtable/nAble data into OneLake.
3.  **`MCP/nable-server/index.py`**: A local Python MCP bridge for nAble. Useful for immediate dev work in VS Code.
4.  **`MCP/memory-server/`**: The local Knowledge Graph where we've stored Dr. D's particulars and the team's workflow nuances.

---

## 🏛️ Architecture Summary (The "Ultimate Boss")
We have architected a **Cognitive Operating System** within Microsoft Foundry to replace manual labor at Reproductive America.

*   **Pillar 1 (The Brain)**: Microsoft Fabric/OneLake. Uses **OneDrive Shortcuts** for instant file search and **Data Factory** to sync Airtable.
*   **Pillar 2 (The Senses)**: **Microsoft Graph API Agent**. Automatically tags and triages group emails in Outlook based on patient context.
*   **Pillar 3 (The Hands)**: **Azure AI Document Intelligence**. Converts handwritten intake forms to JSON, which the nAble Sub-Agent then pushes to the EMR API.
*   **Pillar 4 (The Interface)**: **Foundry Agentic Framework**. An "Executive Boss" agent that manages specialized sub-agents (Researcher, nAble Specialist, Analyst).

---

## 🤖 The "Executive Boss" System Prompt
Copy/Paste this into your Foundry Agent's System Instructions:
> You are the "Executive Chief of Staff" for Reproductive America. Your goal is the total automation of organizational friction. You report to Dr. D. You manage data from nAble, Airtable, and Outlook. You are proactive, curious, and technically precise. Every morning at 7:00 AM, you prepare a "Dr. D Morning Briefing" summarizing the day's schedule and critical follow-ups.

---

## 🚀 Next Steps (When you get home)
1.  **Open Microsoft Fabric**: Create the OneDrive shortcut in a new Lakehouse.
2.  **Deploy Azure AI Search**: Index the Lakehouse. This makes "The Boss" instantly knowledgeable about every file you have.
3.  **Show Dr. D the "Search" POC**: Ask the Foundry Agent: *"Who is the patient Andrea talked to in Spain yesterday?"* 

**Goal for tomorrow**: Prove the value of the "Single Source of Truth" so you can move on to the "fun stuff" (Lab automation and smart office).
