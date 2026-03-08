# GitLab Setup Guide - Adding GitLab as Secondary Remote

This guide will help you add your GitLab repository as a secondary remote to your existing git repository.

## Current Remotes
- `origin`: GitHub (https://github.com/b-def-42/krcmar-v3.git)
- `encore`: Encore remote (encore://krcmar-v3-qie2)

## Step 1: Choose Authentication Method

You have two options: **SSH** (recommended for long-term use) or **HTTPS with Personal Access Token** (easier initial setup).

### Option A: HTTPS with Personal Access Token (Easier)

#### 1.1 Create a Personal Access Token in GitLab

1. Go to GitLab and sign in
2. Click your profile picture (top right) → **Preferences** → **Access Tokens**
3. Or go directly to: `https://gitlab.com/-/user_settings/personal_access_tokens`
4. Create a new token with:
   - **Token name**: e.g., "krcmar-v3-repo"
   - **Expiration date**: Set as needed (or leave blank for no expiration)
   - **Scopes**: Check `write_repository` (or `api` for full access)
5. Click **Create personal access token**
6. **IMPORTANT**: Copy the token immediately (you won't see it again!)

#### 1.2 Add GitLab Remote (HTTPS)

```bash
# Replace YOUR_GITLAB_USERNAME and YOUR_REPO_NAME with your actual values
git remote add gitlab https://gitlab.com/YOUR_GITLAB_USERNAME/YOUR_REPO_NAME.git

# Verify it was added
git remote -v
```

#### 1.3 Configure Git Credential Helper (macOS)

When you push/pull, Git will prompt for credentials:
- **Username**: Your GitLab username
- **Password**: Use your Personal Access Token (not your GitLab password)

To save credentials securely:

```bash
# Configure Git to use macOS Keychain
git config --global credential.helper osxkeychain

# Or use Git credential manager (if installed)
# git config --global credential.helper manager
```

#### 1.4 Test the Connection

```bash
# Fetch from GitLab (will prompt for credentials first time)
git fetch gitlab

# If successful, you'll see branches from GitLab
git branch -r
```

---

### Option B: SSH Keys (Recommended for Long-term)

#### 2.1 Generate SSH Key Pair

```bash
# Generate a new SSH key (replace with your GitLab email)
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_ed25519_gitlab

# Or use RSA if ed25519 isn't supported
# ssh-keygen -t rsa -b 4096 -C "your_email@example.com" -f ~/.ssh/id_rsa_gitlab

# When prompted:
# - Press Enter to accept default location
# - Enter a passphrase (recommended) or press Enter for no passphrase
```

#### 2.2 Add SSH Key to GitLab

1. **Copy your public key**:
   ```bash
   # For ed25519
   cat ~/.ssh/id_ed25519_gitlab.pub | pbcopy
   
   # Or for RSA
   # cat ~/.ssh/id_rsa_gitlab.pub | pbcopy
   ```

2. **Add to GitLab**:
   - Go to GitLab → Profile picture → **Preferences** → **SSH Keys**
   - Or: `https://gitlab.com/-/user_settings/ssh_keys`
   - Paste your public key
   - Add a title (e.g., "MacBook Pro - krcmar-v3")
   - Click **Add key**

#### 2.3 Configure SSH Config (for multiple keys)

If you have multiple SSH keys, configure SSH to use the right one for GitLab:

```bash
# Create/edit SSH config file
nano ~/.ssh/config
```

Add this configuration:

```
Host gitlab.com
  HostName gitlab.com
  User git
  IdentityFile ~/.ssh/id_ed25519_gitlab
  IdentitiesOnly yes
```

Save and exit (Ctrl+X, then Y, then Enter).

#### 2.4 Test SSH Connection

```bash
# Test SSH connection to GitLab
ssh -T git@gitlab.com

# You should see: "Welcome to GitLab, @username!"
```

#### 2.5 Add GitLab Remote (SSH)

```bash
# Replace YOUR_GITLAB_USERNAME and YOUR_REPO_NAME with your actual values
git remote add gitlab git@gitlab.com:YOUR_GITLAB_USERNAME/YOUR_REPO_NAME.git

# Verify it was added
git remote -v
```

#### 2.6 Test the Connection

```bash
# Fetch from GitLab
git fetch gitlab

# If successful, you'll see branches from GitLab
git branch -r
```

---

## Step 2: Push to GitLab

Once authentication is set up, push your code to GitLab:

```bash
# Push main/master branch to GitLab
git push gitlab main

# Or if your default branch is master:
# git push gitlab master

# Push all branches:
# git push gitlab --all

# Push tags:
# git push gitlab --tags
```

---

## Step 3: Set Upstream Tracking (Optional)

To make GitLab your default push target for specific branches:

```bash
# Set GitLab as upstream for main branch
git branch --set-upstream-to=gitlab/main main

# Or push with upstream tracking
git push -u gitlab main
```

---

## Step 4: Verify Setup

```bash
# List all remotes
git remote -v

# Should show:
# encore    encore://krcmar-v3-qie2 (fetch)
# encore    encore://krcmar-v3-qie2 (push)
# gitlab    git@gitlab.com:USERNAME/REPO.git (fetch)  [or https://...]
# gitlab    git@gitlab.com:USERNAME/REPO.git (push)
# origin    https://github.com/b-def-42/krcmar-v3.git (fetch)
# origin    https://github.com/b-def-42/krcmar-v3.git (push)

# Fetch from all remotes
git fetch --all

# List branches from all remotes
git branch -a
```

---

## Common Commands

```bash
# Push to specific remote
git push gitlab main

# Pull from specific remote
git pull gitlab main

# Fetch from specific remote
git fetch gitlab

# Remove remote (if needed)
# git remote remove gitlab

# Change remote URL (if needed)
# git remote set-url gitlab NEW_URL
```

---

## Troubleshooting

### HTTPS: "Authentication failed"
- Make sure you're using the Personal Access Token, not your GitLab password
- Check token expiration date
- Verify token has `write_repository` scope

### SSH: "Permission denied (publickey)"
- Verify SSH key was added to GitLab
- Test connection: `ssh -T git@gitlab.com`
- Check SSH config file if using custom key names
- Verify key permissions: `chmod 600 ~/.ssh/id_ed25519_gitlab`

### "Remote already exists"
- Remove existing remote: `git remote remove gitlab`
- Or use different name: `git remote add gitlab-backup URL`

---

## Quick Start (Choose One)

**For HTTPS (fastest setup):**
1. Create Personal Access Token in GitLab
2. Run: `git remote add gitlab https://gitlab.com/YOUR_USERNAME/YOUR_REPO.git`
3. Run: `git push gitlab main` (will prompt for username/token)

**For SSH (most secure):**
1. Generate SSH key: `ssh-keygen -t ed25519 -C "your_email@example.com"`
2. Add public key to GitLab
3. Run: `git remote add gitlab git@gitlab.com:YOUR_USERNAME/YOUR_REPO.git`
4. Run: `git push gitlab main`
