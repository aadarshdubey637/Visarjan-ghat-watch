"""Create or update a user in the configured database.

Usage: python scripts/create_user.py --email a@b.gov --name "A Officer" --role officer [--password ...]
If --password is omitted you are prompted for it (not echoed).
"""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import database  # noqa: E402
from app.schemas.auth import ROLES  # noqa: E402
from app.services import users  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--email", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--role", required=True, choices=ROLES)
    ap.add_argument("--password", help="omit to be prompted")
    args = ap.parse_args()
    password = args.password or getpass.getpass("Password: ")
    if not 8 <= len(password) <= 128:
        print("Password must be 8-128 characters.", file=sys.stderr)
        return 2
    if len(args.name.strip()) < 2:
        print("Name must have at least 2 characters.", file=sys.stderr)
        return 2
    database.init_db()
    with database.SessionLocal() as db:
        existed = users.get_by_email(db, args.email) is not None
        u = users.upsert_user(db, args.name, args.email, password, args.role)
    print(f"{'Updated' if existed else 'Created'} {u.role} {u.email} ({u.id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
