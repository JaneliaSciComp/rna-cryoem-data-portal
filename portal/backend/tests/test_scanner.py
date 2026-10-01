import os
import shutil

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from rna_portal import parsers
from rna_portal.models import Molecule, MoleculeFile
from rna_portal.scanner import RootUnavailable, scan, warm
from samples import cryosparc_log, header_line

TREE = {
    "Mol9_gRNAde/PDB_deposit/10ZT.pdb": header_line("13-FEB-26", "10ZT") + "END\n",
    "Mol9_gRNAde/PDB_deposit/emd_75574.map": "map",
    "Mol9_gRNAde/AlphaFold/fold_p20_grnade2_model_0.cif": "data_x\n",
    "Mol9_gRNAde/AlphaFold/terms_of_use.md": "terms",
    "Mol9_gRNAde/CryoEM/Maps/cryosparc_P93_J300_json.log": cryosparc_log(2.97),
    "Mol9_gRNAde/CryoEM/Maps/J300_fsc_iteration_009.png": "png",
    "Mol9_gRNAde/CryoEM/Micrographs/J1_raw_data_001.png": "png",
    "Mol23_TrpHolo/PDB_entry/D_1000307649_model-annotate_P1.pdb": header_line("29-APR-26", "13CQ"),
    "Mol23_TrpHolo/CryoEM/Maps/cryosparc_P106_J77_json.log": cryosparc_log(2.77),
}


@pytest.fixture
def root(tmp_path):
    data = tmp_path / "data"
    for rel, content in TREE.items():
        (data / rel).parent.mkdir(parents=True, exist_ok=True)
        (data / rel).write_text(content)
    return data


@pytest.fixture
def thumbs(tmp_path):
    return tmp_path / "thumbnails"


class FakeRender:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def __call__(self, model, out):
        self.calls.append(model)
        if self.fail:
            raise RuntimeError("OVITO crashed")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"png")


def molecule(engine, mol_id):
    with Session(engine) as s:
        m = s.get(Molecule, mol_id)
        if m is not None:
            m.files  # load before the session closes
        return m


def touch_later(path, content):
    path.write_text(content)
    t = path.stat().st_mtime + 10
    os.utime(path, (t, t))


def test_first_scan_catalogs_molecules(engine, root, thumbs):
    render = FakeRender()
    result = scan(engine, root, thumbs, render)

    assert result.added == ["Mol23_TrpHolo", "Mol9_gRNAde"]
    m = molecule(engine, "Mol9_gRNAde")
    assert (m.name, m.pdb_id, m.resolution_a) == ("gRNAde", "10ZT", pytest.approx(2.97))
    assert m.thumbnail_path == "Mol9_gRNAde.png" and (thumbs / "Mol9_gRNAde.png").is_file()
    assert {(f.path.split("/")[-1], f.kind, f.source) for f in m.files} == {
        ("10ZT.pdb", "model", "deposited"),
        ("emd_75574.map", "map", "deposited"),
        ("fold_p20_grnade2_model_0.cif", "model", "predicted"),
        ("cryosparc_P93_J300_json.log", "log", "experimental"),
        ("J300_fsc_iteration_009.png", "plot", "experimental"),
        ("J1_raw_data_001.png", "micrograph", "experimental"),
    }
    assert root / "Mol9_gRNAde/PDB_deposit/10ZT.pdb" in render.calls  # deposited model first
    assert molecule(engine, "Mol23_TrpHolo").pdb_id == "13CQ"


def test_unchanged_rescan_writes_nothing(engine, root, thumbs):
    scan(engine, root, thumbs, FakeRender())
    before = molecule(engine, "Mol9_gRNAde").scanned_at
    render = FakeRender()

    result = scan(engine, root, thumbs, render)

    assert result.unchanged == ["Mol23_TrpHolo", "Mol9_gRNAde"]
    assert result.added == result.updated == result.deleted == []
    assert render.calls == []
    assert molecule(engine, "Mol9_gRNAde").scanned_at == before


def test_changed_file_updates_the_molecule(engine, root, thumbs):
    scan(engine, root, thumbs, FakeRender())
    touch_later(root / "Mol9_gRNAde/CryoEM/Maps/cryosparc_P93_J300_json.log", cryosparc_log(2.5))

    result = scan(engine, root, thumbs, FakeRender())

    assert result.updated == ["Mol9_gRNAde"]
    assert molecule(engine, "Mol9_gRNAde").resolution_a == pytest.approx(2.5)


def test_deleted_file_removes_its_row(engine, root, thumbs):
    scan(engine, root, thumbs, FakeRender())
    (root / "Mol9_gRNAde/PDB_deposit/emd_75574.map").unlink()

    result = scan(engine, root, thumbs, FakeRender())

    assert result.updated == ["Mol9_gRNAde"]
    assert not any(f.path.endswith(".map") for f in molecule(engine, "Mol9_gRNAde").files)


def test_deleted_molecule_removes_its_rows(engine, root, thumbs):
    scan(engine, root, thumbs, FakeRender())
    shutil.rmtree(root / "Mol23_TrpHolo")

    result = scan(engine, root, thumbs, FakeRender())

    assert result.deleted == ["Mol23_TrpHolo"]
    with Session(engine) as s:
        assert s.scalars(select(MoleculeFile).where(MoleculeFile.molecule_id == "Mol23_TrpHolo")).all() == []


@pytest.mark.parametrize("break_root", ["empty", "missing"])
def test_unavailable_root_changes_nothing(engine, root, thumbs, break_root):
    scan(engine, root, thumbs, FakeRender())
    shutil.rmtree(root)
    if break_root == "empty":
        root.mkdir()  # the mount is up but lists nothing, as during a Drive outage

    with pytest.raises(RootUnavailable):
        scan(engine, root, thumbs, FakeRender())

    assert molecule(engine, "Mol9_gRNAde") is not None
    assert molecule(engine, "Mol23_TrpHolo") is not None


def test_one_failing_molecule_doesnt_stop_the_scan(engine, root, thumbs, monkeypatch):
    real = parsers.resolution_a

    def flaky(path):
        if "Mol23" in str(path):
            raise OSError("Drive read failed")
        return real(path)

    monkeypatch.setattr(parsers, "resolution_a", flaky)
    result = scan(engine, root, thumbs, FakeRender())

    assert result.failed == ["Mol23_TrpHolo"]
    assert result.added == ["Mol9_gRNAde"]
    assert molecule(engine, "Mol23_TrpHolo") is None  # its transaction rolled back


def test_render_failure_keeps_molecule(engine, root, thumbs):
    result = scan(engine, root, thumbs, FakeRender(fail=True))

    assert result.failed == []
    assert result.added == ["Mol23_TrpHolo", "Mol9_gRNAde"]
    assert molecule(engine, "Mol9_gRNAde").thumbnail_path is None


def test_molecule_without_models_is_listed(engine, root, thumbs):
    plots = root / "Mol5_Plots/CryoEM/Maps"
    plots.mkdir(parents=True)
    (plots / "J1_fsc.png").write_text("png")
    (root / "Mol6_Empty").mkdir()
    (root / "Mol6_Empty/notes.md").write_text("nothing the scanner catalogs")
    render = FakeRender()

    result = scan(engine, root, thumbs, render)

    assert {"Mol5_Plots", "Mol6_Empty"} <= set(result.added)
    m = molecule(engine, "Mol5_Plots")
    assert (m.thumbnail_path, m.pdb_id, m.resolution_a) == (None, None, None)
    assert [f.kind for f in m.files] == ["plot"]
    assert molecule(engine, "Mol6_Empty").files == []
    assert not any("Mol5_Plots" in str(c) or "Mol6_Empty" in str(c) for c in render.calls)


def test_thumbnail_falls_back_to_a_predicted_model(engine, root, thumbs):
    (root / "Mol9_gRNAde/PDB_deposit/10ZT.pdb").unlink()
    render = FakeRender()

    scan(engine, root, thumbs, render)

    assert root / "Mol9_gRNAde/AlphaFold/fold_p20_grnade2_model_0.cif" in render.calls


def test_warm_reads_what_the_page_loads_and_skips_missing_files(engine, root, thumbs):
    scan(engine, root, thumbs, FakeRender())
    (root / "Mol9_gRNAde/CryoEM/Micrographs/J1_raw_data_001.png").unlink()

    assert warm(engine, root) == [
        "Mol23_TrpHolo/PDB_entry/D_1000307649_model-annotate_P1.pdb",
        "Mol9_gRNAde/AlphaFold/fold_p20_grnade2_model_0.cif",
        "Mol9_gRNAde/CryoEM/Maps/J300_fsc_iteration_009.png",
        "Mol9_gRNAde/PDB_deposit/10ZT.pdb",
    ]
