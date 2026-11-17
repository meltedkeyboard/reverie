-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

-keep class com.hierynomus.** { *; }
-keepclassmembers class com.hierynomus.** { *; }
-dontwarn com.hierynomus.**

-keep class net.engio.mbassy.** { *; }
-keepclassmembers class net.engio.mbassy.** { *; }
-keepclassmembers class * {
    @net.engio.mbassy.listener.Handler <methods>;
    @net.engio.mbassy.listener.Listener <methods>;
    @net.engio.mbassy.** <methods>;
}
-dontwarn net.engio.mbassy.**

-keep class com.rapid7.** { *; }
-keepclassmembers class com.rapid7.** { *; }
-dontwarn com.rapid7.**

-keep class org.bouncycastle.** { *; }
-keepclassmembers class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

-keep class reverie.smb.** { *; }
-keepclassmembers class reverie.smb.** { *; }

-dontwarn javax.el.**
