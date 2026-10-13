require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ReverieSplash'
  s.version        = package['version']
  s.summary        = 'Reverie native animated splash screen'
  s.author         = package['author']
  s.homepage       = 'https://reverie.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.resources = "Resources/**/*"
end
