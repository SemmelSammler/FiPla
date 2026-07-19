// Touch-ID/Passwort-Abfrage für die Finanzplanung-App.
// Exit-Codes: 0 = entsperrt · 1 = abgebrochen/fehlgeschlagen · 2 = nicht verfügbar
// Kompilieren: swiftc -O -o ../bin/touchid-helper touchid.swift
import Foundation
import LocalAuthentication

let ctx = LAContext()
var err: NSError?
// .deviceOwnerAuthentication = Touch ID, sonst automatisch Mac-Passwort als Fallback
guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
    exit(2)
}
let sem = DispatchSemaphore(value: 0)
var ok = false
ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "deine Finanzdaten zu entsperren") { success, _ in
    ok = success
    sem.signal()
}
sem.wait()
exit(ok ? 0 : 1)
