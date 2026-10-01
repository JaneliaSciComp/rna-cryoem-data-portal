import pytest

from rna_portal.parsers import molecule_name, pdb_id, resolution_a
from samples import cryosparc_log, header_line


@pytest.mark.parametrize(
    "folder,name",
    [("Mol9_gRNAde", "gRNAde"), ("Mol23_TrpHolo", "TrpHolo"), ("mol4_x", "x"), ("Ribozyme", "Ribozyme")],
)
def test_molecule_name(folder, name):
    assert molecule_name(folder) == name


def test_pdb_id_from_pdb_header(tmp_path):
    p = tmp_path / "D_1000307649_model-annotate_P1.pdb"
    p.write_text(header_line("29-APR-26", "13CQ") + "END\n")
    assert pdb_id(p) == "13CQ"


def test_pdb_id_from_mmcif_entry(tmp_path):
    p = tmp_path / "deposit.cif"
    p.write_text("data_10ZT\n_entry.id 10zt\n")
    assert pdb_id(p) == "10ZT"


def test_pdb_id_ignores_non_pdb_entry_ids(tmp_path):
    # AlphaFold Server writes a hash as _entry.id.
    p = tmp_path / "fold_2026_01_24_21_00_model_0.cif"
    p.write_text("data_7c26b13cc74c0930\n_entry.id 7c26b13cc74c0930\n")
    assert pdb_id(p) is None


def test_pdb_id_from_file_name(tmp_path):
    p = tmp_path / "10zt.pdb"
    p.write_text("REMARK no header\n")
    assert pdb_id(p) == "10ZT"


def test_pdb_id_none(tmp_path):
    p = tmp_path / "model.pdb"
    p.write_text("ATOM\n")
    assert pdb_id(p) is None


def test_resolution_from_cryosparc_log(tmp_path):
    p = tmp_path / "cryosparc_P93_J300_json.log"
    p.write_text(cryosparc_log(2.9663609005244287))
    assert resolution_a(p) == pytest.approx(2.9664, abs=1e-4)


@pytest.mark.parametrize(
    "content",
    ["not json at all", "[]", '{"output_result_groups": [{"latest_summary_stats": null}]}', "{}"],
)
def test_resolution_absent(tmp_path, content):
    p = tmp_path / "job.log"
    p.write_text(content)
    assert resolution_a(p) is None
