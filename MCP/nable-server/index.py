#!/usr/bin/env python3
"""
nAble API MCP Server

This MCP (Model Context Protocol) server exposes the nAble API as tools
that Claude can use directly.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime
from typing import Any

# Check for MCP library
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    print("MCP library not installed. Run: pip install mcp", file=sys.stderr)


# =============================================================================
# Configuration
# =============================================================================

ENVIRONMENTS = {
    "staging": {
        "base_url": "https://testreproductiveamerica.api-staging.nableivf.com/api/v1",
        "username": "testreproductiveamerica.clinic.stage",
        "password": "eL5FPESJm4c1glVE76LVpG9bOE7nwi03"
    },
    "production": {
        "base_url": "https://reproductiveamerica.api.nableivf.com/api/v1",
        "username": "reproductiveamerica.clinic.prod",
        "password": "SKPNQslrBJEc3hndBs0hOdWwa8D6zLgD"
    }
}


# =============================================================================
# API Client
# =============================================================================

class NableClient:
    """nAble API Client with automatic token management"""

    def __init__(self, env: str = "staging"):
        config = ENVIRONMENTS.get(env, ENVIRONMENTS["staging"])
        self.base_url = config["base_url"]
        self.username = config["username"]
        self.password = config["password"]
        self.token = None
        self.token_expires = 0

    def _ensure_token(self):
        """Get or refresh the auth token"""
        if self.token and time.time() < self.token_expires - 60:
            return

        resp = requests.post(
            f"{self.base_url}/tokens",
            data={"username": self.username, "password": self.password}
        )
        if resp.status_code in [200, 201]:
            data = resp.json()
            self.token = data.get("token")
            self.token_expires = int(data.get("expired_at") or data.get("expires_at", 0))
        else:
            raise Exception(f"Authentication failed: {resp.status_code} {resp.text}")

    def request(self, method: str, endpoint: str, params: dict = None, data: dict = None) -> dict:
        """Make an authenticated API request"""
        self._ensure_token()

        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json"
        }

        if method.upper() == "GET":
            resp = requests.get(url, headers=headers, params=params)
        elif method.upper() == "POST":
            resp = requests.post(url, headers=headers, data=data)
        else:
            return {"error": f"Unknown method: {method}"}

        result = {
            "status_code": resp.status_code,
            "success": resp.status_code in [200, 201, 204]
        }

        if resp.text:
            try:
                result["data"] = resp.json()
            except:
                result["data"] = resp.text

        return result


# =============================================================================
# MCP Server Implementation
# =============================================================================

if MCP_AVAILABLE:
    # Initialize
    server = Server("nable-api")
    env = os.environ.get("NABLE_ENV", "production")
    client = NableClient(env)

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List all available nAble API tools"""
        return [
            Tool(
                name="nable_search_patient",
                description="Search for a patient by account number (MRN), or by last_name + email + dob",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "account_number": {"type": "string", "description": "Patient MRN/account number"},
                        "last_name": {"type": "string", "description": "Patient last name"},
                        "email": {"type": "string", "description": "Patient email"},
                        "dob": {"type": "string", "description": "Date of birth (YYYY-MM-DD)"}
                    }
                }
            ),
            Tool(
                name="nable_get_patient",
                description="Get patient demographics by patient ID",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer", "description": "Patient ID"}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_create_patient",
                description="Create a new patient",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "first_name": {"type": "string"},
                        "last_name": {"type": "string"},
                        "dob": {"type": "string", "description": "YYYY-MM-DD"},
                        "email": {"type": "string"},
                        "phone_cell": {"type": "string"},
                        "phone_preference": {"type": "string", "enum": ["home", "cell", "work"]}
                    },
                    "required": ["first_name", "last_name", "dob", "email", "phone_cell", "phone_preference"]
                }
            ),
            Tool(
                name="nable_get_appointments",
                description="Get appointments for a specific date",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "description": "Date (YYYY-MM-DD)"}
                    },
                    "required": ["date"]
                }
            ),
            Tool(
                name="nable_get_patient_appointments",
                description="Get appointments for a specific patient",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "include_past": {"type": "boolean", "default": False}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_get_appointment_options",
                description="Get available facilities, doctors, and appointment types for booking",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_get_available_dates",
                description="Get available appointment dates for a specific combination",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "facility_id": {"type": "integer"},
                        "doctor_id": {"type": "integer"},
                        "appointment_type_id": {"type": "integer"}
                    },
                    "required": ["patient_id", "facility_id", "doctor_id", "appointment_type_id"]
                }
            ),
            Tool(
                name="nable_get_available_times",
                description="Get available appointment times for a specific date",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "facility_id": {"type": "integer"},
                        "doctor_id": {"type": "integer"},
                        "appointment_type_id": {"type": "integer"},
                        "date": {"type": "string", "description": "YYYY-MM-DD"}
                    },
                    "required": ["patient_id", "facility_id", "doctor_id", "appointment_type_id", "date"]
                }
            ),
            Tool(
                name="nable_book_appointment",
                description="Book an appointment for a patient",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "facility_id": {"type": "integer"},
                        "doctor_id": {"type": "integer"},
                        "appointment_type_id": {"type": "integer"},
                        "date": {"type": "string"},
                        "time": {"type": "string"}
                    },
                    "required": ["patient_id", "facility_id", "doctor_id", "appointment_type_id", "date", "time"]
                }
            ),
            Tool(
                name="nable_get_patient_cycles",
                description="Get treatment cycles for a patient",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_get_cycle_details",
                description="Get detailed cycle information including embryology, medications, ultrasounds",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "cycle_id": {"type": "string"},
                        "include": {"type": "string", "description": "Comma-separated: embryology,medications,ultrasounds"}
                    },
                    "required": ["patient_id", "cycle_id"]
                }
            ),
            Tool(
                name="nable_get_patient_messages",
                description="Get patient inbox/messages",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_send_message",
                description="Send a message from the patient to the clinic",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "to": {"type": "string", "description": "Recipient"},
                        "subject": {"type": "string"},
                        "message": {"type": "string"}
                    },
                    "required": ["patient_id", "to", "subject", "message"]
                }
            ),
            Tool(
                name="nable_get_patient_finances",
                description="Get patient financial information (balances, quotes, receipts)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "type": {"type": "string", "enum": ["balances", "quotes", "receipts", "all"]}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_get_medical_records",
                description="Get patient medical records (prescriptions, vitals, insurance)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "patient_id": {"type": "integer"},
                        "type": {"type": "string", "enum": ["prescriptions", "vitals", "insurance", "all"]}
                    },
                    "required": ["patient_id"]
                }
            ),
            Tool(
                name="nable_get_options",
                description="Get dropdown options for a field (e.g., language_preference, phone_preference)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "keys": {"type": "string", "description": "Comma-separated option keys"}
                    },
                    "required": ["keys"]
                }
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        """Handle tool calls"""
        try:
            result = await handle_tool(name, arguments)
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]
        except Exception as e:
            return [TextContent(type="text", text=json.dumps({"error": str(e)}))]

    async def handle_tool(name: str, args: dict) -> dict:
        """Route tool calls to appropriate handlers"""

        if name == "nable_search_patient":
            params = {}
            if args.get("account_number"):
                params["account_number"] = args["account_number"]
            else:
                params = {k: v for k, v in args.items() if v}
            return client.request("GET", "/patients/search", params=params)

        elif name == "nable_get_patient":
            return client.request("GET", f"/patients/{args['patient_id']}")

        elif name == "nable_create_patient":
            return client.request("POST", "/patients", data=args)

        elif name == "nable_get_appointments":
            return client.request("GET", "/appointments", params={"date": args["date"]})

        elif name == "nable_get_patient_appointments":
            params = {"past": "true"} if args.get("include_past") else {}
            return client.request("GET", f"/patients/{args['patient_id']}/appointments", params=params)

        elif name == "nable_get_appointment_options":
            return client.request("GET", f"/patients/{args['patient_id']}/appointments/options")

        elif name == "nable_get_available_dates":
            params = {
                "patient_id": args["patient_id"],
                "facility_id": args["facility_id"],
                "doctor_id": args["doctor_id"],
                "appointment_type_id": args["appointment_type_id"]
            }
            return client.request("GET", "/resources/schedules/dates", params=params)

        elif name == "nable_get_available_times":
            params = {
                "patient_id": args["patient_id"],
                "facility_id": args["facility_id"],
                "doctor_id": args["doctor_id"],
                "appointment_type_id": args["appointment_type_id"]
            }
            return client.request("GET", f"/resources/schedules/dates/{args['date']}/times", params=params)

        elif name == "nable_book_appointment":
            pid = args.pop("patient_id")
            return client.request("POST", f"/patients/{pid}/appointments", data=args)

        elif name == "nable_get_patient_cycles":
            return client.request("GET", f"/patients/{args['patient_id']}/cycles")

        elif name == "nable_get_cycle_details":
            pid = args["patient_id"]
            cid = args["cycle_id"]
            include = args.get("include", "").split(",")

            result = {"cycle": client.request("GET", f"/patients/{pid}/cycles/{cid}")}

            if "embryology" in include or not include[0]:
                result["embryology"] = client.request("GET", f"/patients/{pid}/cycles/{cid}/embryology")
            if "medications" in include:
                result["medications"] = client.request("GET", f"/patients/{pid}/cycles/{cid}/medications")
            if "ultrasounds" in include:
                result["ultrasounds"] = client.request("GET", f"/patients/{pid}/cycles/{cid}/ultrasounds")

            return result

        elif name == "nable_get_patient_messages":
            return client.request("GET", f"/patients/{args['patient_id']}/messages")

        elif name == "nable_send_message":
            pid = args.pop("patient_id")
            return client.request("POST", f"/patients/{pid}/messages", data=args)

        elif name == "nable_get_patient_finances":
            pid = args["patient_id"]
            ftype = args.get("type", "all")

            if ftype == "all":
                return {
                    "balances": client.request("GET", f"/patients/{pid}/balances"),
                    "quotes": client.request("GET", f"/patients/{pid}/quotes"),
                    "receipts": client.request("GET", f"/patients/{pid}/receipts")
                }
            else:
                return client.request("GET", f"/patients/{pid}/{ftype}")

        elif name == "nable_get_medical_records":
            pid = args["patient_id"]
            rtype = args.get("type", "all")

            if rtype == "all":
                return {
                    "prescriptions": client.request("GET", f"/patients/{pid}/medical-records/prescriptions"),
                    "vitals": client.request("GET", f"/patients/{pid}/medical-records/vitals"),
                    "insurance": client.request("GET", f"/patients/{pid}/insurance")
                }
            elif rtype == "insurance":
                return client.request("GET", f"/patients/{pid}/insurance")
            else:
                return client.request("GET", f"/patients/{pid}/medical-records/{rtype}")

        elif name == "nable_get_options":
            return client.request("GET", "/options", params={"key": args["keys"]})

        else:
            return {"error": f"Unknown tool: {name}"}

    async def main():
        """Run the MCP server"""
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

    if __name__ == "__main__":
        import asyncio
        asyncio.run(main())
