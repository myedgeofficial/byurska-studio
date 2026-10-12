import Foundation
import UIKit
import Capacitor
import EventKit
import EventKitUI
import UserNotifications
import Security

// Domači del aplikacije: koledar, opomniki, obvestila na telefonu, deljenje vsebine in varna shramba ključa za gesla.

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StudioPlugin())
    }
}

@objc(StudioPlugin)
public class StudioPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "StudioPlugin"
    public let jsName = "Studio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "koledar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "opomnik", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dovoljenje", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "obvestila", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deli", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kljucPreberi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kljucShrani", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    private var koledarCall: CAPPluginCall?
    private static let predpona = "studio-"

    private func datum(_ call: CAPPluginCall, _ key: String) -> Date? {
        guard let ms = call.getDouble(key) else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    // MARK: Koledar (Applov zaslon »Nov dogodek«, ki ga uporabnik samo potrdi)

    @objc func koledar(_ call: CAPPluginCall) {
        guard let zacetek = datum(call, "zacetek") else { call.reject("Manjka datum"); return }
        let pokazi = {
            DispatchQueue.main.async {
                let ev = EKEvent(eventStore: self.store)
                ev.title = call.getString("naslov") ?? "Objava"
                ev.notes = call.getString("opis")
                ev.startDate = zacetek
                ev.endDate = zacetek.addingTimeInterval(30 * 60)
                for min in (call.getArray("alarmi", Double.self) ?? [1440, 2880]) {
                    ev.addAlarm(EKAlarm(relativeOffset: -min * 60))
                }
                let vc = EKEventEditViewController()
                vc.eventStore = self.store
                vc.event = ev
                vc.editViewDelegate = self
                self.koledarCall = call
                self.bridge?.viewController?.present(vc, animated: true)
            }
        }
        if #available(iOS 17.0, *) {
            pokazi() // zaslon za nov dogodek ne potrebuje dovoljenja
        } else {
            store.requestAccess(to: .event) { ok, _ in
                if ok { pokazi() } else { call.resolve(["dodano": false, "zavrnjeno": true]) }
            }
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
        koledarCall?.resolve(["dodano": action == .saved])
        koledarCall = nil
    }

    // MARK: Opomniki

    @objc func opomnik(_ call: CAPPluginCall) {
        guard let kdaj = datum(call, "kdaj") else { call.reject("Manjka datum"); return }
        let shrani: (Bool) -> Void = { ok in
            guard ok else { call.resolve(["dodano": false, "zavrnjeno": true]); return }
            let r = EKReminder(eventStore: self.store)
            r.title = call.getString("naslov") ?? "Objava"
            r.notes = call.getString("opis")
            guard let seznam = self.store.defaultCalendarForNewReminders() else {
                call.resolve(["dodano": false]); return
            }
            r.calendar = seznam
            r.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: kdaj)
            for ms in (call.getArray("alarmi", Double.self) ?? []) {
                r.addAlarm(EKAlarm(absoluteDate: Date(timeIntervalSince1970: ms / 1000)))
            }
            do {
                try self.store.save(r, commit: true)
                call.resolve(["dodano": true])
            } catch {
                call.reject("Opomnika ni bilo mogoče shraniti")
            }
        }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToReminders { ok, _ in shrani(ok) }
        } else {
            store.requestAccess(to: .reminder) { ok, _ in shrani(ok) }
        }
    }

    // MARK: Obvestila na telefonu (dan ali dva pred objavo)

    @objc func dovoljenje(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            call.resolve(["dovoljeno": ok])
        }
    }

    @objc func obvestila(_ call: CAPPluginCall) {
        let seznam = call.getArray("seznam", JSObject.self) ?? []
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let stari = pending.map { $0.identifier }.filter { $0.hasPrefix(StudioPlugin.predpona) }
            center.removePendingNotificationRequests(withIdentifiers: stari)
            var dodanih = 0
            for o in seznam.prefix(60) {
                guard let id = o["id"] as? String, let ms = (o["kdaj"] as? NSNumber)?.doubleValue else { continue }
                let kdaj = Date(timeIntervalSince1970: ms / 1000)
                if kdaj <= Date() { continue }
                let c = UNMutableNotificationContent()
                c.title = (o["naslov"] as? String) ?? "Objava"
                c.body = (o["besedilo"] as? String) ?? ""
                c.sound = .default
                let dc = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: kdaj)
                let req = UNNotificationRequest(identifier: StudioPlugin.predpona + id, content: c,
                                                trigger: UNCalendarNotificationTrigger(dateMatching: dc, repeats: false))
                center.add(req)
                dodanih += 1
            }
            call.resolve(["dodanih": dodanih])
        }
    }

    // MARK: Deljenje (shrani v Fotografije, pošlji v Instagram, TikTok ...)

    @objc func deli(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s) else { call.reject("Manjka povezava"); return }
        let ime = (call.getString("ime") ?? "vsebina").replacingOccurrences(of: "/", with: "-")
        URLSession.shared.downloadTask(with: url) { tmp, _, err in
            guard let tmp = tmp, err == nil else { call.reject("Prenos ni uspel"); return }
            let mapa = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            let cilj = mapa.appendingPathComponent(ime)
            do {
                try FileManager.default.createDirectory(at: mapa, withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: tmp, to: cilj)
            } catch {
                call.reject("Datoteke ni bilo mogoče pripraviti"); return
            }
            DispatchQueue.main.async {
                let vc = UIActivityViewController(activityItems: [cilj], applicationActivities: nil)
                vc.completionWithItemsHandler = { _, done, _, _ in
                    try? FileManager.default.removeItem(at: mapa)
                    call.resolve(["deljeno": done])
                }
                if let v = self.bridge?.viewController?.view {
                    vc.popoverPresentationController?.sourceView = v
                    vc.popoverPresentationController?.sourceRect = CGRect(x: v.bounds.midX, y: v.bounds.midY, width: 1, height: 1)
                }
                self.bridge?.viewController?.present(vc, animated: true)
            }
        }.resume()
    }

    // MARK: Ključ za gesla v Keychainu (ostane samo na tem telefonu)

    private func poizvedba(_ ime: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "byurska-studio",
         kSecAttrAccount as String: ime]
    }

    @objc func kljucPreberi(_ call: CAPPluginCall) {
        var q = poizvedba(call.getString("ime") ?? "trezor")
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data,
           let v = String(data: d, encoding: .utf8) {
            call.resolve(["vrednost": v])
        } else {
            call.resolve([:])
        }
    }

    @objc func kljucShrani(_ call: CAPPluginCall) {
        let q = poizvedba(call.getString("ime") ?? "trezor")
        SecItemDelete(q as CFDictionary)
        if let v = call.getString("vrednost"), !v.isEmpty {
            var add = q
            add[kSecValueData as String] = Data(v.utf8)
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
        call.resolve()
    }
}
