#import <Cocoa/Cocoa.h>

static NSString *Payload(void) {
    return [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"runtime"];
}

static NSString *Python(void) {
    for (NSString *path in @[@"/opt/homebrew/bin/python3", @"/usr/local/bin/python3", @"/usr/bin/python3"]) {
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:path]) return path;
    }
    return nil;
}

@interface CaptureDelegate : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@end

@implementation CaptureDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 410, 140)
        styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"ASCII City Capture";
    NSTextField *label = [NSTextField labelWithString:@"Opening your capture window…"];
    label.frame = NSMakeRect(35, 78, 350, 30);
    label.font = [NSFont systemFontOfSize:17 weight:NSFontWeightMedium];
    [self.window.contentView addSubview:label];
    NSProgressIndicator *spinner = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(35, 36, 24, 24)];
    spinner.style = NSProgressIndicatorStyleSpinning;
    [spinner startAnimation:nil];
    [self.window.contentView addSubview:spinner];
    NSTextField *detail = [NSTextField labelWithString:@"Preparing the local city and capture controls."];
    detail.frame = NSMakeRect(72, 36, 310, 24);
    [self.window.contentView addSubview:detail];
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSString *python = Python();
        NSString *script = [Payload() stringByAppendingPathComponent:@"launch.py"];
        NSString *message = nil;
        if (!python) {
            message = @"Python 3 was not found on this Mac. The capture app requires Python 3.9 or newer.";
        } else if (![[NSFileManager defaultManager] fileExistsAtPath:script]) {
            message = @"This application is incomplete. Download and unzip the complete app again.";
        } else {
            NSTask *task = [[NSTask alloc] init];
            task.executableURL = [NSURL fileURLWithPath:python];
            task.arguments = @[script];
            task.currentDirectoryURL = [NSURL fileURLWithPath:Payload()];
            NSMutableDictionary *environment = [[[NSProcessInfo processInfo] environment] mutableCopy];
            environment[@"PYTHONDONTWRITEBYTECODE"] = @"1";
            environment[@"PYTHONUNBUFFERED"] = @"1";
            task.environment = environment;
            NSPipe *pipe = [NSPipe pipe];
            task.standardOutput = pipe;
            task.standardError = pipe;
            NSError *error = nil;
            if (![task launchAndReturnError:&error]) {
                message = error.localizedDescription;
            } else {
                NSData *data = [[pipe fileHandleForReading] readDataToEndOfFile];
                [task waitUntilExit];
                NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"No diagnostic text was returned.";
                NSString *logs = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/ASCII City Capture/logs"];
                [[NSFileManager defaultManager] createDirectoryAtPath:logs withIntermediateDirectories:YES attributes:nil error:nil];
                [output writeToFile:[logs stringByAppendingPathComponent:@"launcher.log"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
                if (task.terminationStatus != 0) message = output;
            }
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.window orderOut:nil];
            if (message) {
                NSAlert *alert = [[NSAlert alloc] init];
                alert.messageText = @"ASCII City Capture could not start";
                alert.informativeText = [message length] > 3500 ? [message substringFromIndex:[message length] - 3500] : message;
                alert.alertStyle = NSAlertStyleWarning;
                [alert addButtonWithTitle:@"Close"];
                [NSApp activateIgnoringOtherApps:YES];
                [alert runModal];
            }
            [NSApp terminate:nil];
        });
    });
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "--self-test") == 0) {
            BOOL complete = YES;
            for (NSString *name in @[@"launch.py", @"server.py", @"release.py", @"web/index.html", @"web/adapter-template.js", @"web/versions.mjs", @"city_versions.py", @"import_jobs.py", @"cache/index.html", @"releases/prototype-4/cache/index.html"]) {
                complete &= [[NSFileManager defaultManager] fileExistsAtPath:[Payload() stringByAppendingPathComponent:name]];
            }
            NSDictionary *result = @{@"complete": @(complete), @"payload": Payload() ?: @"",
                @"python": Python() ?: @"", @"version": [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @""};
            NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
            fwrite(data.bytes, 1, data.length, stdout);
            return complete && Python() ? 0 : 1;
        }
        NSApplication *application = [NSApplication sharedApplication];
        CaptureDelegate *delegate = [[CaptureDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
