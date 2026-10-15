from pathlib import Path
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DELIVERABLES = ROOT.parent / "deliverables"
environment = (ROOT / ".env").read_bytes()
keys = re.findall(rb"^(?:AMD_API_KEY|EVOLUS_API_KEY)=([^\r\n]+)", environment, re.M)
password = re.search(r"^Passphrase: (.+)$", (DELIVERABLES / "TRANSFER_PASSWORD.txt").read_text(), re.M).group(1)
checks = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


def restore(folder, target, phrase=None):
    return subprocess.run(["node", str(folder / "RESTORE.cjs"), "--dest=" + str(target)], input=(phrase + "\n") if phrase is not None else "", text=True, capture_output=True, timeout=60)


with tempfile.TemporaryDirectory(prefix="nexus-transfer-validation-") as temporary:
    directory = Path(temporary)
    extracted = {}
    for variant in ("PUBLIC", "PRIVATE"):
        path = DELIVERABLES / f"NexusForge-{variant}-mailsafe.zip"
        with zipfile.ZipFile(path) as archive:
            check(f"{variant}: valid ZIP checksums", archive.testzip() is None)
            check(f"{variant}: pitch is immediately accessible", "PRESENTATION/NexusForge-Pitch.pdf" in archive.namelist())
            check(f"{variant}: private envelope policy", ("PRIVATE_ENV.aesgcm.json.txt" in archive.namelist()) == (variant == "PRIVATE"))
            check(f"{variant}: no passphrase file", not any("PASSWORD" in name for name in archive.namelist()))
            for name in archive.namelist():
                contents = archive.read(name)
                check(f"{variant}: no plaintext secrets in {name}", password.encode() not in contents and all(key.strip(b'\"\'') not in contents for key in keys))
            folder = directory / variant
            archive.extractall(folder)
            (folder / "RESTORE.cjs.txt").rename(folder / "RESTORE.cjs")
            extracted[variant] = folder
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        check(f"{variant}: published archive hash", f"{actual}  {path.name}" in (DELIVERABLES / "SHA256SUMS.txt").read_text())
    public_target = directory / "public-app"
    restored = restore(extracted["PUBLIC"], public_target)
    check("public restore succeeds", restored.returncode == 0)
    check("public environment has no provider keys", all(key not in (public_target / ".env").read_bytes() for key in keys))
    private_target = directory / "private-app"
    restored = restore(extracted["PRIVATE"], private_target, password)
    check("private restore succeeds", restored.returncode == 0)
    check("private environment round-trips exactly", (private_target / ".env").read_bytes() == environment)
    check("private environment uses owner-only permissions", (private_target / ".env").stat().st_mode & 0o777 == 0o600)
    check("restore never prints secrets", password not in restored.stdout and all(key.decode() not in restored.stdout + restored.stderr for key in keys))
    bad_target = directory / "wrong-password"
    rejected = restore(extracted["PRIVATE"], bad_target, "definitely-not-the-transfer-password")
    check("wrong password rejected before writes", rejected.returncode != 0 and not bad_target.exists())
    existing = (public_target / ".env").read_bytes()
    restored = restore(extracted["PRIVATE"], public_target, password)
    check("existing environment preserved", restored.returncode == 0 and (public_target / ".env").read_bytes() == existing)
    check("private environment separated when destination exists", (public_target / ".env.transfer").read_bytes() == environment)
    link_target = directory / "symlink-app"
    outside = directory / "outside"
    link_target.mkdir()
    outside.mkdir()
    (link_target / "frontend").symlink_to(outside, target_is_directory=True)
    rejected = restore(extracted["PUBLIC"], link_target)
    check("symlink destination rejected without escape", rejected.returncode != 0 and not list(outside.iterdir()))
    tampered = extracted["PUBLIC"] / "payload/README.md.txt"
    tampered.write_text(tampered.read_text() + "\nModified payload")
    rejected = restore(extracted["PUBLIC"], directory / "tampered-app")
    check("tampered payload rejected before restore", rejected.returncode != 0 and not (directory / "tampered-app").exists())
    tests = subprocess.run(["npm", "test"], cwd=private_target, capture_output=True, text=True, timeout=60)
    check("restored application tests pass", tests.returncode == 0)
    build = subprocess.run(["npm", "run", "build:demo"], cwd=private_target, capture_output=True, text=True, timeout=60)
    check("restored application rebuilds offline preview", build.returncode == 0)
    print("Restored application test summary:")
    print("\n".join(tests.stdout.strip().splitlines()[-8:]))

receipt = {"status": "passed", "checks": len(checks), "coverage": ["ZIP CRC and archive SHA-256", "public/private secret policy", "payload hashes", "exact private env decryption", "wrong password", "existing-env preservation", "symlink rejection", "tampered payload", "restored application tests", "restored standalone build"], "note": "Local restore validation. No real provider calls, browser rendering or email-provider delivery is implied."}
(ROOT / "evidence/transfer-validation.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(f"Transfer validation passed: {len(checks)} checks. Keys and passphrase never printed.")
