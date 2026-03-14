package com.nexora.sportsstream

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class TVConfigModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "TVConfig"

    override fun getConstants(): Map<String, Any> = mapOf(
        "IS_TV" to BuildConfig.IS_TV
    )
}
