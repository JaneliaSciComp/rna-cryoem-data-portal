"""Small stand-ins for the team's files, shaped like the real ones in the test Drive folder."""
import json


def header_line(date: str, pdb: str) -> str:
    """A PDB HEADER record with the real files' columns: the ID in columns 63-66."""
    return f"{'HEADER':<10}{'RNA':<40}{date:<12}{pdb:<4}\n"


def cryosparc_log(resolution: float) -> str:
    """A cryoSPARC job's exported JSON (cryosparc_P93_J300_json.log), cut to the part we read."""
    return json.dumps(
        {
            "job_type": "new_local_refine",
            "output_result_groups": [
                {"uid": "J300-G0", "summary": {}},
                {
                    "uid": "J300-G1",
                    "latest_summary_stats": {
                        "fsc_info_best": {"radwn_final_A": resolution, "radwn_nomask_A": 3.5}
                    },
                },
            ],
        }
    )
