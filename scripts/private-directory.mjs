import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Windows chmod cannot enforce owner-only access. Create the leaf with a
// protected, inheritable DACL before any recovery bytes are written, then read
// it back. Existing directories are checked, never silently re-permissioned.
// Paths are environment data, never interpolated into PowerShell source.
const windowsDirectory = String.raw`
$ErrorActionPreference = 'Stop'
$directory = $env:GTL_RECOVERY_DIRECTORY
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
if (-not [System.IO.Directory]::Exists($directory)) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class GtlPrivateDirectory {
  [StructLayout(LayoutKind.Sequential)]
  private struct SecurityAttributes {
    public int Length;
    public IntPtr Descriptor;
    public int InheritHandle;
  }
  [DllImport("kernel32.dll", EntryPoint="CreateDirectoryW", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CreateDirectory(string name, ref SecurityAttributes attributes);
  public static bool Create(string name, byte[] descriptor) {
    var pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
    try {
      var attributes = new SecurityAttributes {
        Length = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = pinned.AddrOfPinnedObject()
      };
      if (CreateDirectory(name, ref attributes)) return true;
      int error = Marshal.GetLastWin32Error();
      if (error == 183) return false;
      throw new Win32Exception(error);
    } finally { pinned.Free(); }
  }
}
'@
  $security = New-Object System.Security.AccessControl.DirectorySecurity
  $security.SetOwner($user)
  $security.SetAccessRuleProtection($true, $false)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
  $security.AddAccessRule($rule)
  $created = [GtlPrivateDirectory]::Create($directory, $security.GetSecurityDescriptorBinaryForm())
  if (-not $created -and $env:GTL_RECOVERY_EXCLUSIVE -eq '1') { throw 'Directory already exists' }
} elseif ($env:GTL_RECOVERY_EXCLUSIVE -eq '1') { throw 'Directory already exists' }

$info = New-Object System.IO.DirectoryInfo($directory)
if (-not $info.Exists -or ($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Invalid directory' }
$acl = $info.GetAccessControl()
if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $user.Value) { throw 'Not private' }
$ownerInherited = $false
foreach ($entry in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  if ($entry.AccessControlType -ne 'Allow') { continue }
  if ($entry.IdentityReference.Value -notin @($user.Value, 'S-1-5-18', 'S-1-5-32-544')) { throw 'Shared access' }
  if ($entry.IdentityReference.Value -eq $user.Value -and
      ($entry.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl -and
      $entry.InheritanceFlags -eq 'ContainerInherit, ObjectInherit' -and $entry.PropagationFlags -eq 'None') { $ownerInherited = $true }
}
if (-not $ownerInherited) { throw 'Missing inheritable owner access' }
Write-Output 'PRIVATE'
`;

export function makePrivateDirectory(directory, { recursive = false, exclusive = false } = {}) {
  if (process.platform !== 'win32') {
    fs.mkdirSync(directory, { recursive: recursive && !exclusive, mode: 0o700 });
    if ((fs.statSync(directory).mode & 0o077) !== 0) throw new Error('Recovery directory must be private (mode 0700).');
    return;
  }
  // Ancestors contain no recovery data; the protected leaf is created atomically.
  if (recursive) fs.mkdirSync(path.dirname(path.resolve(directory)), { recursive: true });
  try {
    const result = execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(windowsDirectory, 'utf16le').toString('base64')], {
        encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GTL_RECOVERY_DIRECTORY: path.resolve(directory), GTL_RECOVERY_EXCLUSIVE: exclusive ? '1' : '0' },
      });
    if (result.trim() !== 'PRIVATE') throw new Error('Unverified permissions');
  } catch {
    throw new Error('Cannot create or verify a private Windows recovery directory; no recovery data was written.');
  }
}
