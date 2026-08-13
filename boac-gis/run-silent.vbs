Option Explicit

Dim shell, fileSystem, scriptDirectory, command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDirectory

command = "cmd.exe /d /c """ & scriptDirectory & "\run.bat"""
shell.Run command, 0, False

